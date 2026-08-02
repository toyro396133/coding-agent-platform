/**
 * Structured Error Details & Codes for the external agent API.
 *
 * Roadmap Phase 2.3 requires a "detailed error structure" (Error details &
 * codes) so external clients can react to failures without parsing free-text.
 * Instead of a single status-derived code (`job_failed` / `cancelled`), a
 * failed job is classified into a specific, machine-readable code
 * (`build_failed`, `sandbox_timeout`, `auth_error`, ...) by inspecting the
 * task's error message and the pipeline log entries. Each classification also
 * carries a stable category, the failing pipeline stage (when determinable), a
 * retryability flag, and a static, client-facing recovery hint.
 */

export type JobErrorCode =
  | 'cancelled'
  | 'build_failed'
  | 'test_failed'
  | 'lint_failed'
  | 'sandbox_timeout'
  | 'sandbox_creation_failed'
  | 'dependency_install_failed'
  | 'agent_failed'
  | 'agent_install_failed'
  | 'auth_error'
  | 'git_clone_failed'
  | 'git_push_failed'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'worker_failed'
  | 'orchestrator_failed'
  | 'visual_qa_failed'
  | 'unknown_failure'

export type JobErrorCategory =
  | 'cancellation'
  | 'build'
  | 'verification'
  | 'infrastructure'
  | 'authentication'
  | 'git'
  | 'agent'
  | 'limits'
  | 'unknown'

export interface JobErrorDetails {
  /** Stable machine-readable code (see JobErrorCode) */
  code: JobErrorCode
  /** Coarse grouping of the error (build, git, authentication, ...) */
  category: JobErrorCategory
  /** Failing pipeline stage when determinable from the logs (e.g. "Type Check") */
  stage: string | null
  /** The task error message, when one was recorded */
  message: string | null
  /** True when resubmitting the job has a realistic chance of success */
  retryable: boolean
  /** Static, client-facing guidance — never contains dynamic values */
  recovery_hint: string | null
  /** ISO timestamp of when the failure was recorded, when known */
  failedAt: string | null
}

export interface JobErrorInput {
  status: string
  error?: string | null
  /** Task logs (LogEntry[] shape); only `type` and `message` are read */
  logs?: Array<{ type?: string | null; message?: string | null }> | null
}

interface ErrorRule {
  code: JobErrorCode
  category: JobErrorCategory
  stage?: string | null
  retryable: boolean
  recovery_hint: string
  /** Case-insensitive regexes matched against the error + error-log text */
  patterns: RegExp[]
}

// Ordered by specificity: the first rule whose pattern matches wins. Timeouts
// and auth failures must be checked before generic agent/git rules because
// their messages often contain the same keywords.
const RULES: ErrorRule[] = [
  {
    code: 'sandbox_timeout',
    category: 'infrastructure',
    stage: 'Sandbox',
    retryable: true,
    recovery_hint: 'Increase the max duration or use a smaller repository, then resubmit.',
    patterns: [/timeout/i, /timed out/i, /etimedout/i, /timeouterror/i],
  },
  {
    code: 'rate_limited',
    category: 'limits',
    stage: null,
    retryable: true,
    recovery_hint: 'Wait for the rate-limit window to reset, then resubmit.',
    patterns: [/rate limit/i, /\b429\b/, /quota/i, /exhausted/i],
  },
  {
    code: 'auth_error',
    category: 'authentication',
    stage: null,
    retryable: false,
    recovery_hint: 'Reconnect the GitHub account or add the required provider API key, then resubmit.',
    patterns: [
      /api key/i,
      /_api_key/i,
      /gh_token/i,
      /github_token/i,
      /authentication failed/i,
      /unauthorized/i,
      /\b401\b/,
      /\b403\b/,
      /auth required/i,
      /authentication required/i,
      // NOTE: no bare /authenticate/i here — it would misclassify messages like
      // "Tests failed: authenticate endpoint" as auth errors (test_failed is
      // checked later). Keep to explicit authentication-failure phrasings.
      /permission denied/i,
      /access token/i,
      /please set the api key/i,
    ],
  },
  {
    code: 'dependency_install_failed',
    category: 'infrastructure',
    stage: 'Dependencies',
    retryable: true,
    recovery_hint: 'Fix the dependency installation issue (registry access, lockfile) and resubmit.',
    patterns: [
      /install.*dependenc/i,
      /dependenc.*install/i,
      /install failed/i,
      /npm error.*install/i,
      /pnpm.*error.*install/i,
      /pip install failed/i,
      /npm err!.*install/i,
      /package.*not found/i,
    ],
    // Note: `/cannot find module/i` is intentionally excluded here — it is a
    // build/type-check signal (TS2307) that belongs to build_failed.
  },
  {
    code: 'build_failed',
    category: 'build',
    stage: 'Type Check',
    retryable: true,
    recovery_hint: 'Fix the reported TypeScript/build errors and resubmit.',
    patterns: [
      /type check/i,
      /\btsc\b/,
      /build failed/i,
      /compilation/i,
      /error ts/i,
      /typescript error/i,
      /ts\d{4}/i,
      /cannot find module/i,
    ],
    // `/cannot find module/i` (TS2307) is a missing-dependency symptom that
    // surfaces during type-check/build; classify it as a build failure so
    // clients get actionable guidance to fix the code rather than reinstall.
  },
  {
    code: 'test_failed',
    category: 'verification',
    stage: 'Tests',
    retryable: true,
    recovery_hint: 'Fix the failing tests and resubmit.',
    patterns: [/test.*fail/i, /fail.*test/i, /\bvitest\b/i, /\bjest\b/i, /\bpytest\b/i, /test suite/i, /tests failed/i],
  },
  {
    code: 'lint_failed',
    category: 'verification',
    stage: 'Lint & Format',
    retryable: true,
    recovery_hint: 'Fix the lint/format errors and resubmit.',
    patterns: [/lint.*error/i, /\beslint\b/i, /prettier.*error/i, /\bbiome\b.*error/i, /lint check/i, /lint errors/i],
  },
  {
    code: 'git_clone_failed',
    category: 'git',
    stage: 'Clone',
    retryable: true,
    recovery_hint: 'Verify the repository URL and access permissions, then resubmit.',
    patterns: [/failed to clone/i, /clone.*fail/i, /repository not found/i, /repo.*not found/i],
  },
  // worker_failed must precede git_push_failed: a worker-team push failure
  // ("Failed to push worker team changes to repository") is a worker-team
  // failure (retryable), not a plain push failure. Patterns are worker-team
  // specific (not bare /worker.*fail/) so messages like "Visual QA worker
  // failed" still classify as visual_qa_failed later.
  {
    code: 'worker_failed',
    category: 'agent',
    stage: 'Worker Team',
    retryable: true,
    recovery_hint: 'The worker team failed; resubmit or reduce the team size.',
    patterns: [
      /worker team.*fail/i,
      /worker team execution failed/i,
      /worker team auto.?deploy.*fail/i,
      /worker merge.*conflict/i,
      /merge.*worker changes/i,
      /worker team changes to repository/i,
      /push.*worker team/i,
    ],
  },
  {
    code: 'git_push_failed',
    category: 'git',
    stage: 'Push',
    retryable: false,
    recovery_hint: 'Check branch permissions and the GitHub connection, then resubmit.',
    patterns: [/failed to push/i, /push.*fail/i, /remote rejected/i, /push rejected/i],
  },
  {
    code: 'agent_install_failed',
    category: 'agent',
    stage: 'Agent Setup',
    retryable: true,
    recovery_hint: 'Retry with a different agent, or configure the agent CLI and resubmit.',
    patterns: [/failed to install.*cli/i, /cli.*not found/i, /installation may have failed/i],
  },
  {
    code: 'orchestrator_failed',
    category: 'agent',
    stage: 'Orchestrator',
    retryable: true,
    recovery_hint: 'The orchestrator failed while planning/refining the request; resubmit or simplify the prompt.',
    patterns: [
      /orchestrator.*fail/i,
      /fail.*orchestrator/i,
      /orchestrator.*error/i,
      /sub.?agent.*fail/i,
      /spawn.*agent.*fail/i,
      /orchestrator.*skipped/i,
    ],
  },
  {
    code: 'budget_exceeded',
    category: 'limits',
    stage: null,
    retryable: false,
    recovery_hint: 'Reduce the request scope (shorter prompt, fewer steps) and resubmit.',
    patterns: [/budget/i, /max steps/i, /step limit/i, /cost limit/i, /token limit/i, /context length/i],
  },
  {
    code: 'visual_qa_failed',
    category: 'verification',
    stage: 'Visual Verification',
    retryable: true,
    recovery_hint: 'Visual QA failed to verify the UI; check the screenshots/dev server and resubmit.',
    patterns: [
      /visual qa.*fail/i,
      /visual.*verification.*fail/i,
      /screenshot.*fail/i,
      /playwright.*fail/i,
      /critique.*fail/i,
      /vision.*model.*fail/i,
      /visual qa.*error/i,
    ],
  },
  {
    code: 'sandbox_creation_failed',
    category: 'infrastructure',
    stage: 'Sandbox',
    retryable: true,
    recovery_hint: 'Sandbox provisioning failed; retry in a moment.',
    patterns: [
      /failed to create sandbox/i,
      /sandbox creation failed/i,
      /create sandbox/i,
      /sandbox.*fail/i,
      /failed to initialize git/i,
    ],
  },
  {
    code: 'agent_failed',
    category: 'agent',
    stage: 'Agent Execution',
    retryable: true,
    recovery_hint: 'The coding agent failed; consider a different agent/model and resubmit.',
    patterns: [
      /agent execution failed/i,
      /command execution failed/i,
      /cli failed/i,
      /execution failed/i,
      /no result returned/i,
      /unknown agent type/i,
    ],
  },
]

// ─── Public error-code catalog ───────────────────────────────────────────
// Single source of truth for all machine-readable error codes, derived from
// the classification rules above (plus the two codes that are not matched by
// patterns: `cancelled` and `unknown_failure`). Used by the capabilities
// documentation, the UI error panel, and external clients.

export interface ErrorCodeCatalogEntry {
  /** Stable machine-readable code (see JobErrorCode) */
  code: JobErrorCode
  /** Coarse grouping of the error (build, git, authentication, ...) */
  category: JobErrorCategory
  /** Failing pipeline stage when determinable (e.g. "Type Check") */
  stage: string | null
  /** True when resubmitting the job has a realistic chance of success */
  retryable: boolean
  /** Static, client-facing guidance — never contains dynamic values */
  recovery_hint: string
}

export const ERROR_CODE_CATALOG: ErrorCodeCatalogEntry[] = [
  {
    code: 'cancelled',
    category: 'cancellation',
    stage: null,
    retryable: false,
    recovery_hint: 'The job was stopped. Resubmit the job to start a fresh run.',
  },
  ...RULES.map(({ code, category, stage, retryable, recovery_hint }) => ({
    code,
    category,
    stage: stage ?? null,
    retryable,
    recovery_hint,
  })),
  {
    code: 'unknown_failure',
    category: 'unknown',
    stage: null,
    retryable: true,
    recovery_hint: 'The job failed for an unknown reason. Review the logs and retry.',
  },
]

// Pipeline stage markers, ordered so the LAST matching log wins (the failure
// stage is typically the most recent relevant entry).
const STAGE_MARKERS: Array<[string, RegExp]> = [
  ['Type Check', /type check/i],
  ['Tests', /\btests\b|\btest suite\b|vitest|jest|pytest/i],
  ['Lint & Format', /lint|eslint|prettier|biome/i],
  ['Dependency Audit', /dependency audit|npm audit/i],
  ['Visual Verification', /visual|screenshot|playwright/i],
  ['Dependencies', /dependenc|npm install|pnpm|pip install/i],
  ['Clone', /clone/i],
  ['Push', /push/i],
  ['Orchestrator', /orchestrator|sub.?agent|spawn.*agent/i],
  ['Worker Team', /worker/i],
  ['Sandbox', /sandbox/i],
]

function detectStage(errorLogs: string[], infoLogs: string[]): string | null {
  let stage: string | null = null
  // Error logs carry the strongest signal; info logs are a weaker fallback.
  for (const message of [...errorLogs, ...infoLogs]) {
    for (const [name, pattern] of STAGE_MARKERS) {
      if (pattern.test(message)) stage = name
    }
  }
  return stage
}

// ─── Structured task.error format ────────────────────────────────────────
// The runtime persists failures into the `tasks.error` column as a small JSON
// envelope (code + stage + message + failedAt) instead of a free-text message
// so the failure location and timing survive across requests. `deriveErrorDetails`
// treats an envelope as authoritative (no pattern matching needed) and falls
// back to log/message classification only for legacy plain-text errors.

export interface StructuredTaskError {
  /** Envelope version — lets parse safely reject arbitrary JSON */
  v: number
  code: JobErrorCode
  stage: string | null
  message: string | null
  failedAt: string | null
}

const STRUCTURED_ERROR_VERSION = 1

/**
 * Serialize a classified failure into the structured `tasks.error` envelope.
 * The `v` field lets `parseStructuredTaskError` safely reject arbitrary JSON.
 */
export function formatStructuredTaskError(
  details: Pick<JobErrorDetails, 'code' | 'stage'>,
  message: string | null,
  failedAt?: Date | string | null,
): string {
  const envelope: StructuredTaskError = {
    v: STRUCTURED_ERROR_VERSION,
    code: details.code,
    stage: details.stage ?? null,
    message: message ?? null,
    failedAt: failedAt ? new Date(failedAt).toISOString() : null,
  }
  return JSON.stringify(envelope)
}

/**
 * Parse a `tasks.error` envelope previously written by `formatStructuredTaskError`.
 * Returns null when the value is not a structured envelope (legacy text errors).
 */
export function parseStructuredTaskError(error: string | null | undefined): StructuredTaskError | null {
  if (!error) return null
  try {
    const parsed = JSON.parse(error) as Partial<StructuredTaskError>
    if (parsed?.v !== STRUCTURED_ERROR_VERSION) return null
    if (typeof parsed.code !== 'string') return null
    return {
      v: STRUCTURED_ERROR_VERSION,
      code: parsed.code as JobErrorCode,
      stage: typeof parsed.stage === 'string' ? parsed.stage : null,
      message: typeof parsed.message === 'string' ? parsed.message : null,
      failedAt: typeof parsed.failedAt === 'string' ? parsed.failedAt : null,
    }
  } catch {
    return null
  }
}

/**
 * Return the human-readable message from a `tasks.error` value, falling back
 * to the raw string when it is not a structured envelope. Use this at display
 * points (UI, orchestrator prompt) so a persisted envelope never leaks JSON.
 */
export function getReadableTaskError(error: string | null | undefined): string | null {
  if (!error) return null
  const parsed = parseStructuredTaskError(error)
  return parsed?.message || error
}

/**
 * Classify a job's failure into a structured, machine-readable error.
 *
 * Returns null for non-terminal statuses. `stopped` always maps to `cancelled`.
 * A persisted structured envelope (see `formatStructuredTaskError`) is treated
 * as authoritative — its code/stage/failedAt win and no pattern matching runs.
 * For plain-text errors the classification inspects the task error message plus
 * error-level log entries (pipeline failures are logged with type `error`).
 * When no specific signal matches, `unknown_failure` is returned with a
 * detected stage (if any) so clients still get a stable shape.
 */
export function deriveErrorDetails(input: JobErrorInput): JobErrorDetails | null {
  const { status, error, logs } = input

  // Envelope first: the runtime already classified this failure (including
  // continue-route stages like orchestrator / worker team / visual QA).
  const structured = parseStructuredTaskError(error)

  if (status === 'stopped') {
    return {
      code: 'cancelled',
      category: 'cancellation',
      stage: null,
      message: structured?.message ?? error ?? null,
      retryable: false,
      recovery_hint: 'The job was stopped. Resubmit the job to start a fresh run.',
      failedAt: structured?.failedAt ?? null,
    }
  }

  if (status !== 'error') return null

  // Fast path: a valid envelope (other than unknown_failure) is authoritative.
  const rule =
    structured && structured.code !== 'unknown_failure' ? RULES.find((r) => r.code === structured.code) : undefined
  if (structured && rule) {
    return {
      code: rule.code,
      category: rule.category,
      stage: structured.stage ?? rule.stage ?? null,
      message: structured.message ?? error ?? null,
      retryable: rule.retryable,
      recovery_hint: rule.recovery_hint,
      failedAt: structured.failedAt ?? null,
    }
  }

  const message = structured?.message ?? error ?? null

  const errorLogs: string[] = []
  const infoLogs: string[] = []
  for (const log of logs || []) {
    const logMessage = log?.message || ''
    if (log?.type === 'error') errorLogs.push(logMessage)
    else if (log?.type === 'info') infoLogs.push(logMessage)
  }

  const haystack = [message, ...errorLogs].filter(Boolean).join('\n')

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return {
        code: rule.code,
        category: rule.category,
        stage: rule.stage ?? detectStage(errorLogs, infoLogs),
        message,
        retryable: rule.retryable,
        recovery_hint: rule.recovery_hint,
        failedAt: structured?.failedAt ?? null,
      }
    }
  }

  return {
    code: 'unknown_failure',
    category: 'unknown',
    stage: detectStage(errorLogs, infoLogs),
    message,
    retryable: true,
    recovery_hint: 'The job failed for an unknown reason. Review the logs and retry.',
    failedAt: structured?.failedAt ?? null,
  }
}
