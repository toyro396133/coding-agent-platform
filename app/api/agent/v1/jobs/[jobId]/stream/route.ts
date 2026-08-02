import { NextRequest } from 'next/server'
import { extractBearerToken, validatePlatformApiKey } from '@/lib/auth/api-key'
import { db } from '@/lib/db/client'
import { tasks, taskMessages } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { deriveErrorDetails } from '@/lib/api/job-errors'
import { buildJobDiffForTask, type JobDiffTaskRef } from '@/lib/api/job-diff'
import { subscribeJob } from '@/lib/jobs/event-bus'

// Maximum polling duration in milliseconds (5 minutes)
const MAX_POLLING_DURATION = 5 * 60 * 1000

// Terminal states after which the stream sends final messages and closes.
const TERMINAL_STATUSES = ['completed', 'error', 'stopped']

// Helper function to fetch and send final messages
async function sendFinalMessages(jobId: string, sendEvent: (data: any) => void) {
  const msgs = await db
    .select()
    .from(taskMessages)
    .where(eq(taskMessages.taskId, jobId))
    .orderBy(asc(taskMessages.createdAt))
    .limit(100)

  if (msgs.length > 0) {
    sendEvent({
      id: `job-messages-${jobId}`,
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
 * streaming clients receive the patch without an extra poll. Best-effort:
 * when the diff can't be computed (e.g. unauthenticated private repo) nothing
 * is emitted rather than failing the stream.
 */
async function sendJobDiff(
  jobId: string,
  userId: string,
  task: JobDiffTaskRef,
  sendEvent: (data: any) => void,
): Promise<void> {
  const diff = await buildJobDiffForTask(task, userId)
  if (!diff) return
  sendEvent({
    id: `job-diff-${jobId}`,
    object: 'platform.job.diff',
    created: Math.floor(Date.now() / 1000),
    diff,
  })
}

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('authorization')
    const token = extractBearerToken(authHeader)

    if (!token) {
      return new Response(
        JSON.stringify({
          error: { message: 'Missing Authorization header', type: 'invalid_request_error' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const userId = await validatePlatformApiKey(token)

    if (!userId) {
      return new Response(
        JSON.stringify({
          error: { message: 'Invalid API key', type: 'invalid_request_error' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { jobId } = await context.params

    // 2. Verify job belongs to user
    const taskResult = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, jobId), eq(tasks.userId, userId)))
      .limit(1)

    if (taskResult.length === 0) {
      return new Response(
        JSON.stringify({
          error: { message: 'Job not found', type: 'invalid_request_error' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const task = taskResult[0]

    // 3. Set up SSE stream
    const encoder = new TextEncoder()
    let isClosed = false
    let intervalId: NodeJS.Timeout | null = null
    let unsubscribe: (() => void) | null = null
    // Idempotency guards: a cancel event replayed on subscribe plus the
    // terminal-state branch can both fire in the same tick (the first finish()
    // awaits a DB query before isClosed flips). These flags make cancellation
    // emission and stream finalization single-shot.
    let cancelledEmitted = false
    let finished = false

    const close = () => {
      if (isClosed) return
      isClosed = true
      if (intervalId) clearInterval(intervalId)
      if (unsubscribe) unsubscribe()
      unsubscribe = null
    }

    const stream = new ReadableStream({
      async start(controller) {
        req.signal.addEventListener('abort', close)

        const sendEvent = (data: any) => {
          if (isClosed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch (err) {
            close()
          }
        }

        // Send final messages, then the [DONE] marker, then close the stream.
        const finish = async () => {
          if (finished) return
          finished = true
          try {
            await sendFinalMessages(jobId, sendEvent)
            if (!isClosed) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            }
          } catch (err) {
            console.error('Error finalizing job stream')
          } finally {
            close()
          }
        }

        // Emit the cancellation event as its own contract event.
        const emitCancelled = (timestamp: number, status: string) => {
          if (cancelledEmitted) return
          cancelledEmitted = true
          sendEvent({
            id: `job-cancelled-${jobId}-${timestamp}`,
            object: 'platform.job.cancelled',
            created: Math.floor(timestamp / 1000),
            status,
            cancelled: true,
          })
        }

        // Structured error details for terminal states (roadmap 2.3)
        const errorDetails = deriveErrorDetails({ status: task.status, error: task.error, logs: task.logs })

        // Send initial status (no diff — progress events stay lean; the patch
        // is delivered as its own platform.job.diff event on completion)
        sendEvent({
          id: `job-sync-${jobId}`,
          object: 'platform.job.status',
          created: Math.floor(Date.now() / 1000),
          status: task.status,
          progress: task.progress || 0,
          error_code: errorDetails?.code ?? null,
          error_details: errorDetails,
        })

        // Subscribe to the in-process event bus so a cancel request (the cancel
        // route publishes { type: 'cancelled', status: 'stopped' }) is delivered
        // to this stream immediately as platform.job.cancelled — no waiting for
        // the next DB poll.
        unsubscribe = subscribeJob(jobId, (event) => {
          if (isClosed) return
          if (event.type === 'cancelled') {
            emitCancelled(event.timestamp, event.status || 'stopped')
            void finish()
          }
        })

        // If the task is already in a terminal state, deliver the terminal
        // payload and close.
        if (TERMINAL_STATUSES.includes(task.status)) {
          if (task.status === 'completed') {
            await sendJobDiff(jobId, userId, task, sendEvent)
          } else if (task.status === 'stopped') {
            emitCancelled(Date.now(), task.status)
          }
          await finish()
          return
        }

        // For active tasks, we poll the DB for status changes
        // In a production app, we would use Redis Pub/Sub or similar
        // Since this is a template, we use simple polling for the SSE stream

        let lastStatus = task.status as any
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
            if (Date.now() - pollingStartTime > MAX_POLLING_DURATION) {
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
              .where(eq(tasks.id, jobId))
              .limit(1)

            // Task no longer exists
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
              lastStatus = currentTask.status as any
              lastProgress = currentTask.progress || 0

              const currentErrorDetails = deriveErrorDetails({
                status: currentTask.status,
                error: currentTask.error,
                logs: currentTask.logs,
              })

              sendEvent({
                id: `job-sync-${jobId}-${Date.now()}`,
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
                  await sendJobDiff(jobId, userId, currentTask, sendEvent)
                } else if (currentTask.status === 'stopped') {
                  // Fallback when the cancel event-bus publish was missed
                  emitCancelled(Date.now(), currentTask.status)
                }
                await finish()
                if (intervalId) clearInterval(intervalId)
              }
            }
          } catch (e) {
            console.error('Error polling task status')
          }
        }, 3000) // Poll every 3 seconds
      },
      cancel() {
        // Handle client disconnects
        close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error in job stream endpoint')
    return new Response(
      JSON.stringify({
        error: { message: 'Internal server error', type: 'api_error' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
