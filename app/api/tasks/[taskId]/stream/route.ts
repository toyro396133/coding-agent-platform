import { and, asc, eq, isNull } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { buildJobDiffForTask } from '@/lib/api/job-diff'
import { deriveErrorDetails } from '@/lib/api/job-errors'
import { db } from '@/lib/db/client'
import { taskMessages, tasks } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

// Maximum stream duration in milliseconds (5 minutes) as a safety net so a
// client connection can never leak past the platform's function timeout.
const MAX_STREAM_DURATION = 5 * 60 * 1000

// Terminal states after which the stream sends final messages and closes.
const TERMINAL_STATUSES = ['completed', 'error', 'stopped']

// Helper function to fetch and send final messages
async function sendFinalMessages(taskId: string, sendEvent: (data: any) => void) {
  const msgs = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, taskId))
    .orderBy(asc(taskMessages.createdAt))
    .limit(100)

  if (msgs.length > 0) {
    sendEvent({
      id: `job-messages-${taskId}`,
      object: 'platform.job.messages',
      created: Math.floor(Date.now() / 1000),
      messages: msgs.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    })
  }

  sendEvent({ done: true })
}

/**
 * Emit the structured diff/patch for a completed job as its own SSE event so
 * the UI receives the patch in the platform.job.diff contract format without
 * polling per-file diff endpoints. Best-effort: when the diff can't be computed
 * (e.g. unauthenticated private repo) nothing is emitted rather than failing.
 */
async function sendJobDiff(
  taskId: string,
  userId: string,
  task: {
    status: string
    repoUrl?: string | null
    branchName?: string | null
    prMergeCommitSha?: string | null
  },
  sendEvent: (data: any) => void,
): Promise<void> {
  const diff = await buildJobDiffForTask(task, userId)
  if (!diff) return
  sendEvent({
    id: `job-diff-${taskId}`,
    object: 'platform.job.diff',
    created: Math.floor(Date.now() / 1000),
    diff,
  })
}

export async function GET(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  // Session-authenticated (internal UI endpoint) — unlike the external
  // /api/agent/v1/jobs/[jobId]/stream which requires a platform API key.
  const session = await getServerSession()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { taskId } = await context.params

  const taskResult = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
    .limit(1)

  if (taskResult.length === 0) {
    return new Response(JSON.stringify({ error: 'Task not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const task = taskResult[0]

  const encoder = new TextEncoder()
  let isClosed = false
  let intervalId: NodeJS.Timeout | null = null
  let durationId: NodeJS.Timeout | null = null

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => {
        if (isClosed) return
        isClosed = true
        if (intervalId) clearInterval(intervalId)
        if (durationId) clearTimeout(durationId)
      }

      req.signal.addEventListener('abort', close)

      const sendEvent = (data: any) => {
        if (isClosed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch (err) {
          close()
        }
      }

      const finish = async () => {
        try {
          await sendFinalMessages(taskId, sendEvent)
          if (!isClosed) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        } catch (err) {
          console.error('Error finalizing internal job stream')
        } finally {
          close()
        }
      }

      const errorDetails = deriveErrorDetails({ status: task.status, error: task.error, logs: task.logs })

      // Send initial status (no diff — progress events stay lean; the patch is
      // delivered as its own platform.job.diff event on completion)
      sendEvent({
        id: `job-sync-${taskId}`,
        object: 'platform.job.status',
        created: Math.floor(Date.now() / 1000),
        status: task.status,
        progress: task.progress || 0,
        error_code: errorDetails?.code ?? null,
        error_details: errorDetails,
      })

      // If the task is already in a terminal state, deliver the diff (when
      // completed) and close.
      if (TERMINAL_STATUSES.includes(task.status)) {
        if (task.status === 'completed') {
          await sendJobDiff(taskId, session.user.id, task, sendEvent)
        }
        await finish()
        return
      }

      // Active task: poll the DB for status/progress changes and emit the
      // contract events, then deliver the patch on completion.
      let lastStatus = task.status
      let lastProgress = task.progress || 0
      let lastHeartbeat = Date.now()
      const pollingStartTime = Date.now()

      intervalId = setInterval(async () => {
        if (isClosed) {
          if (intervalId) clearInterval(intervalId)
          return
        }

        try {
          // Check for max polling duration
          if (Date.now() - pollingStartTime > MAX_STREAM_DURATION) {
            if (!isClosed) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            }
            close()
            return
          }

          // Send periodic heartbeat (every 15 seconds)
          if (Date.now() - lastHeartbeat > 15000) {
            if (!isClosed) {
              controller.enqueue(encoder.encode(': ping\n\n'))
            }
            lastHeartbeat = Date.now()
          }

          const currentTaskResult = await db
            .select({
              status: tasks.status,
              progress: tasks.progress,
              error: tasks.error,
              logs: tasks.logs,
              repoUrl: tasks.repoUrl,
              branchName: tasks.branchName,
              prMergeCommitSha: tasks.prMergeCommitSha,
            })
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1)

          if (currentTaskResult.length === 0) {
            if (!isClosed) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            }
            close()
            return
          }

          const currentTask = currentTaskResult[0]

          if (currentTask.status !== lastStatus || currentTask.progress !== lastProgress) {
            lastStatus = currentTask.status
            lastProgress = currentTask.progress || 0

            const currentErrorDetails = deriveErrorDetails({
              status: currentTask.status,
              error: currentTask.error,
              logs: currentTask.logs,
            })

            sendEvent({
              id: `job-sync-${taskId}-${Date.now()}`,
              object: 'platform.job.status',
              created: Math.floor(Date.now() / 1000),
              status: currentTask.status,
              progress: currentTask.progress || 0,
              error_code: currentErrorDetails?.code ?? null,
              error_details: currentErrorDetails,
            })

            if (TERMINAL_STATUSES.includes(currentTask.status)) {
              // Deliver the patch for completed jobs before closing
              if (currentTask.status === 'completed') {
                await sendJobDiff(taskId, session.user.id, currentTask, sendEvent)
              }
              await finish()
              if (intervalId) clearInterval(intervalId)
            }
          }
        } catch (e) {
          console.error('Error polling task status')
        }
      }, 3000)

      // Safety net: cap the stream lifetime so a hung client can never leak
      // beyond the function timeout
      durationId = setTimeout(() => {
        if (!isClosed) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
        close()
      }, MAX_STREAM_DURATION)
    },
    cancel() {
      isClosed = true
      if (intervalId) clearInterval(intervalId)
      if (durationId) clearTimeout(durationId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
