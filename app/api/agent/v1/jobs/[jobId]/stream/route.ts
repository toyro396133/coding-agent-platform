import { NextRequest } from 'next/server'
import { extractBearerToken, validatePlatformApiKey } from '@/lib/auth/api-key'
import { db } from '@/lib/db/client'
import { tasks, taskMessages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

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
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false

        req.signal.addEventListener('abort', () => {
          isClosed = true
        })

        const sendEvent = (data: any) => {
          if (!isClosed) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }
        }

        // Send initial status
        sendEvent({
          id: `job-sync-${jobId}`,
          object: 'platform.job.status',
          created: Math.floor(Date.now() / 1000),
          status: task.status,
          progress: task.progress || 0,
        })

        // If the task is already in a terminal state, just send the final status and close
        if (task.status === 'completed' || task.status === 'error' || task.status === 'stopped') {
          // Fetch any agent messages
          const msgs = await db.select().from(taskMessages).where(eq(taskMessages.taskId, jobId))

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
          if (!isClosed) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
          return
        }

        // For active tasks, we poll the DB for status changes
        // In a production app, we would use Redis Pub/Sub or similar
        // Since this is a template, we use simple polling for the SSE stream

        let lastStatus = task.status as any
        let lastProgress = task.progress || 0

        const intervalId = setInterval(async () => {
          if (isClosed) {
            clearInterval(intervalId)
            return
          }

          try {
            const currentTaskResult = await db
              .select({ status: tasks.status, progress: tasks.progress })
              .from(tasks)
              .where(eq(tasks.id, jobId))
              .limit(1)

            if (currentTaskResult.length > 0) {
              const currentTask = currentTaskResult[0]

              if (currentTask.status !== lastStatus || currentTask.progress !== lastProgress) {
                lastStatus = currentTask.status as any
                lastProgress = currentTask.progress || 0

                sendEvent({
                  id: `job-sync-${jobId}-${Date.now()}`,
                  object: 'platform.job.status',
                  created: Math.floor(Date.now() / 1000),
                  status: currentTask.status,
                  progress: currentTask.progress || 0,
                })

                if (
                  currentTask.status === 'completed' ||
                  currentTask.status === 'error' ||
                  currentTask.status === 'stopped'
                ) {
                  // Fetch final messages
                  const msgs = await db.select().from(taskMessages).where(eq(taskMessages.taskId, jobId))

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
                  if (!isClosed) {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                    controller.close()
                  }
                  clearInterval(intervalId)
                }
              }
            }
          } catch (e) {
            console.error('Error polling task status:', e)
          }
        }, 3000) // Poll every 3 seconds

        // Cleanup on close
        req.signal.addEventListener('abort', () => {
          clearInterval(intervalId)
        })
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
    console.error('Error in job stream endpoint:', error)
    return new Response(
      JSON.stringify({
        error: { message: 'Internal server error', type: 'api_error' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
