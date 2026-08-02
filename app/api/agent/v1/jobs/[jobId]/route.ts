import { and, asc, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { buildJobDiffForTask, type JobDiff } from '@/lib/api/job-diff'
import { deriveErrorDetails } from '@/lib/api/job-errors'
import { extractBearerToken, validatePlatformApiKey } from '@/lib/auth/api-key'
import { db } from '@/lib/db/client'
import { taskMessages, tasks } from '@/lib/db/schema'

// Terminal states after which a result is considered final
const TERMINAL_STATUSES = ['completed', 'error', 'stopped']

/**
 * GET /api/agent/v1/jobs/[jobId]
 *
 * Fetch the current state of a job created via the external agent API
 * (OpenAI-compatible chat completions): status, progress, full log stream,
 * conversation messages, and the final result — all in an OpenAI-compatible
 * response shape. Complements the SSE job stream: polling this endpoint gives
 * the same information as a one-shot read for clients that don't want to
 * maintain a persistent connection.
 *
 * Query param `?include_diff=false` skips the diff computation (and its GitHub
 * compare calls) for clients that already received the patch via the SSE
 * stream; `platform_metadata.diff_included` reports whether the diff was
 * computed in this response. Default is true — backward compatible.
 *
 * Authenticated with the platform API key; the job must belong to the key's
 * owner.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    // 1. Authenticate Request
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

    // 2. Verify job belongs to user
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, jobId), eq(tasks.userId, userId)))
      .limit(1)

    if (!task) {
      return NextResponse.json(
        {
          error: { message: 'Job not found', type: 'invalid_request_error' },
        },
        { status: 404 },
      )
    }

    // 3. Fetch conversation messages (ordered oldest → newest). Matches the
    //    cap used by the SSE job stream so both endpoints stay consistent.
    const messages = await db
      .select()
      .from(taskMessages)
      .where(eq(taskMessages.taskId, jobId))
      .orderBy(asc(taskMessages.createdAt))
      .limit(100)

    // 4. Derive the result: the last agent message is the final response
    const agentMessages = messages.filter((m) => m.role === 'agent')
    const lastAgentMessage = agentMessages[agentMessages.length - 1]

    const status = task.status
    const isTerminal = TERMINAL_STATUSES.includes(status)

    // Structured error details & codes (roadmap 2.3): classify the terminal
    // status + error message + pipeline logs into a stable machine-readable
    // code (build_failed, sandbox_timeout, auth_error, ...) with a category,
    // failing stage, retryability and a recovery hint.
    const errorDetails = deriveErrorDetails({ status, error: task.error, logs: task.logs })
    // 'stop' only for genuinely successful completions; error/stopped jobs get
    // 'content_filter' so a strict OpenAI consumer can't misread them as success.
    const finishReason = status === 'completed' ? 'stop' : isTerminal ? 'content_filter' : null

    // OpenAI-compatible message content — the agent's final answer, or a
    // status placeholder for jobs that are still running / failed early.
    // Prefer the readable message from error_details (task.error may hold a
    // structured envelope — never leak raw JSON into the assistant content).
    const content =
      lastAgentMessage?.content ??
      (status === 'error' || status === 'stopped'
        ? errorDetails?.message || task.error || `Job ${status}`
        : `Job is ${status}`)

    const createdAtUnix = task.createdAt ? Math.floor(new Date(task.createdAt).getTime() / 1000) : 0

    // 5. Compute the structured diff/patch for completed jobs. Best-effort:
    //    when it can't be computed (e.g. unauthenticated private repo) the
    //    field is simply null — never fail the whole job fetch for it.
    //
    //    Clients that already received the patch via the SSE stream
    //    (platform.job.diff on terminal completed) can opt out with
    //    ?include_diff=false — the computation (and its GitHub compare calls)
    //    is skipped entirely and diff stays null. Default is true, so existing
    //    pollers are unaffected.
    const includeDiff = req.nextUrl.searchParams.get('include_diff') !== 'false'
    const diff: JobDiff | null = includeDiff ? await buildJobDiffForTask(task, userId) : null

    // 6. Build the OpenAI-compatible response with full platform metadata
    return NextResponse.json({
      id: `chatcmpl-${task.id}`,
      object: 'chat.completion',
      created: createdAtUnix,
      model: task.selectedModel || 'agent-router',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      // Platform specific metadata — full job state for pollers
      platform_metadata: {
        job_id: task.id,
        object: 'platform.job',
        status,
        progress: task.progress || 0,
        // Readable message; the full structure lives in error_details
        error: errorDetails?.message ?? task.error ?? null,
        // Machine-readable error code + structured details (Error details & codes)
        error_code: errorDetails?.code ?? null,
        error_details: errorDetails,
        terminal: isTerminal,
        result: content,
        // Structured Diff/Patch contract (see lib/api/job-diff.ts)
        diff,
        // Whether diff was computed in this response. false when the caller
        // passed ?include_diff=false (patch already delivered via SSE) or the
        // diff could not be computed — clients can distinguish an intentional
        // skip from an unavailable diff by comparing this flag with the request.
        diff_included: includeDiff,
        branch_name: task.branchName || null,
        pr_url: task.prUrl || null,
        preview_url: task.previewUrl || null,
        sandbox_url: task.sandboxUrl || null,
        selected_agent: task.selectedAgent || null,
        selected_model: task.selectedModel || null,
        repo_url: task.repoUrl || null,
        created: createdAtUnix,
        updated_at: task.updatedAt ? Math.floor(new Date(task.updatedAt).getTime() / 1000) : createdAtUnix,
        completed_at: task.completedAt ? Math.floor(new Date(task.completedAt).getTime() / 1000) : null,
        logs: (task.logs || []).map((log) => ({
          type: log.type,
          message: log.message,
          timestamp: log.timestamp,
        })),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      },
    })
  } catch (_error) {
    console.error('Error fetching job state')
    return NextResponse.json(
      {
        error: { message: 'Internal server error', type: 'api_error' },
      },
      { status: 500 },
    )
  }
}
