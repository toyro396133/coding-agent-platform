/**
 * retry.ts — Exponential backoff retry for LLM API calls.
 *
 * The AI SDK provider calls can fail transiently (429 rate limits, 5xx
 * server errors, network timeouts). This module wraps async LLM calls
 * with exponential backoff + jitter so the router, orchestrator, and
 * auto-fix loops stay resilient without spamming the provider.
 *
 * Design:
 *  - Configurable max retries (default 3), base delay (default 1000ms),
 *    and max delay (default 30s)
 *  - Captures the provider's Retry-After header from the FIRST failed
 *    response and uses it to drive every subsequent retry, instead of
 *    computing a fresh exponential backoff per attempt
 *  - Full jitter (randomized) on exponential backoff to avoid
 *    thundering-herd on shared quota; provider-mandated Retry-After waits
 *    are never shortened (upward-only jitter ×1.0–1.3 de-synchronizes
 *    clients sharing the same window)
 *  - Only retries transient errors — permanent errors (invalid key,
 *    bad request, schema validation) fail fast
 */

// ─── Error classification ──────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = [429, 408, 409, 500, 502, 503, 504]

/**
 * Best-effort classification of whether an error is transient.
 * Provider errors vary in shape; we match on common signals.
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false

  if (typeof error === 'object') {
    const e = error as Record<string, any>

    // AI SDK / OpenAI-style: { status, statusCode, headers }
    const status = e.status ?? e.statusCode ?? e.response?.status
    if (typeof status === 'number' && RETRYABLE_STATUS_CODES.includes(status)) {
      return true
    }

    // Vercel AI SDK APIError
    if (e.name === 'AI_APICallError' || e.name === 'APICallError' || e.name === 'AI_RetryError') {
      return true
    }

    // Rate limit / overloaded messages
    const message = String(e.message ?? '').toLowerCase()
    const headers = e.headers as Record<string, string> | undefined
    const retryAfter = headers?.['retry-after']
    if (retryAfter) return true
    if (message.includes('rate limit') || message.includes('rate_limit')) return true
    if (message.includes('too many requests') || message.includes('overloaded')) return true
    if (message.includes('temporarily unavailable') || message.includes('try again later')) return true
    if (message.includes('timeout') || message.includes('timed out') || message.includes('etimedout')) return true
    if (message.includes('econnreset') || message.includes('econnrefused')) return true
    if (message.includes('internal server error') || message.includes('bad gateway')) return true
  }

  return false
}

/**
 * Extract a retry-after hint (seconds) from an error's headers if present.
 * The value captured from the FIRST failed response drives the entire retry
 * schedule, so a provider's rate-limit window is respected across attempts.
 */
function getRetryAfterSeconds(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const e = error as Record<string, any>
  const headers = e.headers as Record<string, string> | undefined
  const raw = headers?.['retry-after']
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Compute the delay (ms) before the next retry.
 *
 * When a provider Retry-After was captured from the first failure, every
 * retry waits that exact amount (capped by maxDelayMs) — the same window each
 * time, so the client stops hammering until the provider says it's clear.
 * Otherwise fall back to capped exponential backoff with full jitter.
 */
function computeRetryDelay(
  retryAfterMs: number | null,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  if (retryAfterMs !== null) {
    // Provider-mandated wait — never shorten it, only cap it. Upward-only
    // jitter (×1.0–1.3) de-synchronizes clients that share a quota and receive
    // the same Retry-After, avoiding a thundering herd at the window edge.
    const jittered = retryAfterMs * (1 + Math.random() * 0.3)
    return Math.min(jittered, maxDelayMs)
  }

  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
  // Full jitter: random value between half and full exponential delay
  return Math.floor(exponential * (0.5 + Math.random() * 0.5))
}

// ─── Retry options ─────────────────────────────────────────────────────

export interface RetryOptions {
  /** Max retry attempts after the initial call (default: 3) */
  maxRetries?: number
  /** Base delay in ms before the first retry (default: 1000) */
  baseDelayMs?: number
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs?: number
  /** Optional label for logging (e.g. 'router.llm-enhance') */
  label?: string
  /** Override the transient-error classifier (for tests) */
  isRetryable?: (error: unknown) => boolean
}

// ─── Core retry wrapper ────────────────────────────────────────────────

const DEFAULT_RETRY_OPTIONS: Required<Pick<RetryOptions, 'maxRetries' | 'baseDelayMs' | 'maxDelayMs'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
}

/**
 * Wrap an async LLM call with exponential backoff retry.
 *
 * @param fn The async LLM call to execute.
 * @param options Retry configuration.
 * @returns The result of the first successful call.
 * @throws The last error after all retries are exhausted, or the first
 *         non-transient error immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    maxRetries: options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs,
  }
  const isRetryable = options.isRetryable ?? isRetryableError

  let attempt = 0
  // Captured strictly from the FIRST failed response and reused for every
  // retry. A boolean flag (not `retryAfterMs === null`) guarantees a later
  // response can never change the schedule once the first attempt ran.
  let captured = false
  let retryAfterMs: number | null = null

  while (true) {
    try {
      return await fn()
    } catch (error) {
      const canRetry = attempt < maxRetries && isRetryable(error)

      if (!canRetry) {
        throw error
      }

      attempt++

      // Capture the provider's Retry-After only from the first failure; once
      // decided, it fixes the wait for all remaining attempts instead of
      // computing an independent backoff per attempt.
      if (!captured) {
        captured = true
        const retryAfter = getRetryAfterSeconds(error)
        retryAfterMs = retryAfter !== null ? retryAfter * 1000 : null
      }

      const delay = computeRetryDelay(retryAfterMs, attempt, baseDelayMs, maxDelayMs)

      if (options.label) {
        console.error('LLM API call failed, retrying with backoff')
      }

      await sleep(delay)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Convenience wrapper for AI SDK model calls ────────────────────────

/**
 * Wrap a model client call with retry. Intended for call sites that build
 * a fresh `generateObject`/`generateText` call per invocation.
 *
 * Example:
 *   const result = await withModelRetry(() => generateObject({ model, ... }), 'router')
 */
export function withModelRetry<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  return withRetry(fn, { label })
}
