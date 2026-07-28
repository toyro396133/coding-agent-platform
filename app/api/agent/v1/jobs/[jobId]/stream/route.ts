import { NextRequest } from 'next/server'
import { extractBearerToken, validatePlatformApiKey } from '@/lib/auth/api-key'
import { db } from '@/lib/db/client'
import { tasks, taskMessages } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'

// Maximum polling duration in milliseconds (5 minutes)
const MAX_POLLING_DURATION = 5 * 60 * 1000

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
 * Streams authenticated job status updates and completion messages over Server-Sent Events.
 *
 * @param req - The incoming request containing the authorization credentials and abort signal.
 * @param context - The route context containing the job identifier.
 * @returns An SSE response with job updates, or a JSON error response when authentication, authorization, or processing fails.
 */
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
    const stream = new ReadableStream({
      async start(controller) {
        req.signal.addEventListener('abort', () => {
          isClosed = true
          if (intervalId) {
            clearInterval(intervalId)
          }
        })

        const sendEvent = (data: any) => {
          if (isClosed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch (err) {
            // Stream is closed or errored, mark as closed to stop further attempts
            isClosed = true
            if (intervalId) {
              clearInterval(intervalId)
            }
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
          await sendFinalMessages(jobId, sendEvent)
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
        let lastHeartbeat = Date.now()
        const pollingStartTime = Date.now()

        intervalId = setInterval(async () => {
          if (isClosed) {
            if (intervalId) {
              clearInterval(intervalId)
            }
            return
          }

          try {
            // Check for max polling duration
            if (Date.now() - pollingStartTime > MAX_POLLING_DURATION) {
              if (!isClosed) {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
              }
              if (intervalId) {
                clearInterval(intervalId)
              }
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
              .select({ status: tasks.status, progress: tasks.progress })
              .from(tasks)
              .where(eq(tasks.id, jobId))
              .limit(1)

            // Task no longer exists
            if (currentTaskResult.length === 0) {
              if (!isClosed) {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
              }
              if (intervalId) {
                clearInterval(intervalId)
              }
              return
            }

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
                await sendFinalMessages(jobId, sendEvent)
                if (!isClosed) {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                  controller.close()
                }
                if (intervalId) {
                  clearInterval(intervalId)
                }
              }
            }
          } catch (e) {
            console.error('Error polling task status')
          }
        }, 3000) // Poll every 3 seconds

        // Cleanup on close
        req.signal.addEventListener('abort', () => {
          if (intervalId) {
            clearInterval(intervalId)
          }
        })
      },
      cancel() {
        // Handle client disconnects
        isClosed = true
        if (intervalId) {
          clearInterval(intervalId)
        }
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
