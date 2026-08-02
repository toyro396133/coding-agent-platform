import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, validatePlatformApiKey } from '@/lib/auth/api-key'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { publishJobEvent } from '@/lib/jobs/event-bus'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { killSandbox } from '@/lib/sandbox/sandbox-registry'

const TERMINAL_STATUSES = ['completed', 'error', 'stopped']

/**
 * POST /api/agent/v1/jobs/[jobId]/cancel
 *
 * Cancel a running job created via the external agent API (OpenAI-compatible
 * chat completions). Authenticated with the platform API key; the job must
 * belong to the key's owner.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    // 1. Authenticate
    const authHeader = req.headers.get('authorization')
    const token = extractBearerToken(authHeader)

    if (!token) {
      return NextResponse.json(
        {
          error: { message: 'Missing Authorization header', type: 'invalid_request_error' },
        },
        { status: 401 },
      )
    }

    const userId = await validatePlatformApiKey(token)

    if (!userId) {
      return NextResponse.json(
        {
          error: { message: 'Invalid API key', type: 'invalid_request_error' },
        },
        { status: 401 },
      )
    }

    const { jobId } = await context.params

    // 2. Verify job exists and belongs to the user
    const [existingTask] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, jobId), eq(tasks.userId, userId)))
      .limit(1)

    if (!existingTask) {
      return NextResponse.json(
        {
          error: { message: 'Job not found', type: 'invalid_request_error' },
        },
        { status: 404 },
      )
    }

    // 3. Terminal jobs cannot be cancelled
    if (TERMINAL_STATUSES.includes(existingTask.status)) {
      return NextResponse.json({
        id: jobId,
        object: 'platform.job.cancelled',
        created: Math.floor(Date.now() / 1000),
        status: existingTask.status,
        cancelled: false,
        message: `Job is already in terminal state: ${existingTask.status}`,
      })
    }

    // 4. Mark the task as stopped
    const logger = createTaskLogger(jobId)
    await logger.info('Cancel request received via external API - terminating job...')

    const [updatedTask] = await db
      .update(tasks)
      .set({
        status: 'stopped',
        error: 'Job was cancelled via external API',
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(and(eq(tasks.id, jobId), eq(tasks.userId, userId)))
      .returning()

    // 5. Publish an immediate cancellation event so connected job streams
    //    (SSE) react in real time instead of waiting for the next poll.
    publishJobEvent(jobId, { type: 'cancelled', status: 'stopped' })

    // 6. Kill the sandbox immediately so the agent stops
    try {
      const killResult = await killSandbox(jobId)
      if (killResult.success) {
        await logger.success('Sandbox killed successfully')
      } else {
        await logger.error('Failed to kill sandbox')
      }
    } catch (killError) {
      console.error('Failed to kill sandbox during cancel:', killError)
      await logger.error('Failed to kill sandbox during cancel')
    }

    await logger.error('Job cancelled via external API')

    return NextResponse.json({
      id: jobId,
      object: 'platform.job.cancelled',
      created: Math.floor(Date.now() / 1000),
      status: updatedTask.status,
      cancelled: true,
      message: 'Job cancelled successfully',
    })
  } catch (error) {
    console.error('Error in cancel job endpoint')
    return NextResponse.json(
      {
        error: { message: 'Internal server error', type: 'api_error' },
      },
      { status: 500 },
    )
  }
}
