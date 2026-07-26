import 'server-only'

import { asc, eq, and, sql, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  apiKeysPool,
  functionRouting,
  DEFAULT_FUNCTION_ROUTING,
  type ProviderValue,
  type FunctionValue,
} from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'

// ---------------------------------------------------------------------------
// Provider-specific quota reset schedules
// ---------------------------------------------------------------------------

type QuotaCycle = 'daily' | 'monthly'

type ProviderQuotaSchedule = {
  cycle: QuotaCycle
  /** UTC hour (0-23) when the quota window resets. */
  resetHourUTC: number
  /** Day of month (1-28) for monthly cycles. */
  resetDayOfMonth?: number
  /** Human-readable label shown in the UI. */
  description: string
}

/**
 * Real-world quota reset timings for every provider supported by the pool.
 *
 * ── Daily providers ──
 * • Gemini free tier:    1 500 req/day, resets at midnight Pacific  → 08:00 UTC
 * • DeepSeek free tier:  daily limit,     resets at midnight Beijing → 16:00 UTC
 * • Vercel AI Gateway:   passes through to the underlying provider; we
 *                         default to a generous daily window so stuck keys
 *                         never block the pool forever.
 *
 * ── Monthly providers ──
 * • OpenAI:   credits + hard limits reset on the 1st of each month, 00:00 UTC
 * • Anthropic: same billing-cycle semantics as OpenAI
 * • Cursor:    monthly subscription cycle
 */
const PROVIDER_QUOTA_SCHEDULE: Record<ProviderValue, ProviderQuotaSchedule> = {
  openai: { cycle: 'monthly', resetHourUTC: 0, resetDayOfMonth: 1, description: '1st of month, midnight UTC' },
  anthropic: { cycle: 'monthly', resetHourUTC: 0, resetDayOfMonth: 1, description: '1st of month, midnight UTC' },
  gemini: { cycle: 'daily', resetHourUTC: 8, description: 'daily at 08:00 UTC (midnight Pacific)' },
  deepseek: { cycle: 'daily', resetHourUTC: 16, description: 'daily at 16:00 UTC (midnight Beijing)' },
  cursor: { cycle: 'monthly', resetHourUTC: 0, resetDayOfMonth: 1, description: '1st of month, midnight UTC' },
  aigateway: { cycle: 'daily', resetHourUTC: 0, description: 'daily at midnight UTC' },
}

/** Exported so the settings UI can display per-provider reset info. */
export function getProviderQuotaSchedule(provider: ProviderValue): ProviderQuotaSchedule {
  return PROVIDER_QUOTA_SCHEDULE[provider]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayUtc = (): string => new Date().toISOString().slice(0, 10)

const envKeyForProvider = (provider: ProviderValue): string | undefined => {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY
    case 'gemini':
      return process.env.GEMINI_API_KEY
    case 'cursor':
      return process.env.CURSOR_API_KEY
    case 'aigateway':
      return process.env.AI_GATEWAY_API_KEY
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY
    default:
      return undefined
  }
}

/**
 * Compute the next reset time *after* `exhaustedAt` for the given provider.
 * Returns `null` when `exhaustedAt` is missing.
 */
export function computeNextProviderReset(exhaustedAt: Date | null, provider: ProviderValue): Date | null {
  if (!exhaustedAt) return null
  const schedule = PROVIDER_QUOTA_SCHEDULE[provider]
  if (!schedule) return null

  if (schedule.cycle === 'daily') {
    // Next occurrence of resetHourUTC after exhaustedAt.
    const reset = new Date(exhaustedAt)
    reset.setUTCHours(schedule.resetHourUTC, 0, 0, 0)
    if (reset <= exhaustedAt) {
      reset.setUTCDate(reset.getUTCDate() + 1)
    }
    return reset
  }

  // monthly
  const dom = schedule.resetDayOfMonth ?? 1
  const reset = new Date(Date.UTC(exhaustedAt.getUTCFullYear(), exhaustedAt.getUTCMonth(), dom, schedule.resetHourUTC, 0, 0, 0))
  if (reset <= exhaustedAt) {
    // move to next month
    reset.setUTCMonth(reset.getUTCMonth() + 1)
  }
  return reset
}

/**
 * Auto-unexhaust keys whose provider-specific quota window has passed.
 *
 * This replaces the earlier generic "next UTC day" logic: now each provider
 * uses its own documented reset schedule. Keys that set an explicit
 * `quota_reset_minutes` override continue to use that precise window.
 */
async function maybeAutoResetKeys(userId: string, functionName: FunctionValue): Promise<void> {
  const now = new Date()
  try {
    // 1. Keys with an explicit quota_reset_minutes override – keep that path.
    await db.execute(sql`
      UPDATE api_keys_pool
      SET is_exhausted = false,
          usage_count = 0,
          last_used_at = NULL,
          quota_window_day = NULL,
          exhausted_at = NULL,
          updated_at = ${now}
      WHERE user_id = ${userId}
        AND function_name = ${functionName}
        AND is_exhausted = true
        AND quota_reset_minutes IS NOT NULL
        AND exhausted_at IS NOT NULL
        AND exhausted_at + (quota_reset_minutes || 0) * INTERVAL '1 minute' < ${now}
    `)

    // 2. Keys without an explicit override – use the provider schedule.
    const exhaustedKeys = await db
      .select({
        id: apiKeysPool.id,
        provider: apiKeysPool.provider,
        exhaustedAt: apiKeysPool.exhaustedAt,
      })
      .from(apiKeysPool)
      .where(
        and(
          eq(apiKeysPool.userId, userId),
          eq(apiKeysPool.functionName, functionName),
          eq(apiKeysPool.isExhausted, true),
        ),
      )

    for (const row of exhaustedKeys) {
      // Only auto-reset if there's no explicit override (it was handled above).
      const resetAt = computeNextProviderReset(row.exhaustedAt, row.provider as ProviderValue)
      if (resetAt && resetAt <= now) {
        await db
          .update(apiKeysPool)
          .set({
            isExhausted: false,
            usageCount: 0,
            lastUsedAt: null,
            quotaWindowDay: null,
            exhaustedAt: null,
            updatedAt: now,
          })
          .where(eq(apiKeysPool.id, row.id))
      }
    }
  } catch {
    // best-effort – never break a call for quota housekeeping
  }
}

/** Errors we throw when the pool is exhausted; lets the UI display something useful. */
export class AllKeysExhaustedError extends Error {
  readonly code = 'ALL_KEYS_EXHAUSTED'
  readonly functionName: FunctionValue
  constructor(functionName: FunctionValue) {
    super(`All API keys for function "${functionName}" are exhausted or missing`)
    this.functionName = functionName
  }
}

/**
 * Selected key handed back to the caller – keeps the encrypted id so we can
 * mark it exhausted or bump usage once the call completes.
 */
export type SelectedApiKey = {
  id: string
  provider: ProviderValue
  rawValue: string
  source: 'pool' | 'env' | 'legacy-keys'
}

/**
 * Routes a request to the next healthy key for the given function. Walks the
 * preferred provider ordering, picks the healthy pool key with the oldest
 * lastUsedAt, and falls back to environment keys only when the user has
 * configured none of their own. Records the pick so that round-robin stays
 * balanced and quota tracking stays accurate.
 */
export async function selectApiKeyForFunction(
  functionName: FunctionValue,
  opts: { modelHint?: string; userId?: string } = {},
): Promise<SelectedApiKey> {
  const session = await getServerSession()
  const userId = opts.userId ?? session?.user?.id
  if (!userId) {
    // Anonymous requests can still run if there is an env var – keeps SSR pages
    // working while showing signed-out users the prompt to sign in.
    return selectFromEnvironmentOnly(functionName)
  }

  // First, auto-reset any exhausted keys whose quota window has passed.
  await maybeAutoResetKeys(userId, functionName)

  const routing = await resolveRouting(userId, functionName)

  for (const provider of routing.preferredProviders) {
    const keys = await db
      .select()
      .from(apiKeysPool)
      .where(
        and(
          eq(apiKeysPool.userId, userId),
          eq(apiKeysPool.functionName, functionName),
          eq(apiKeysPool.provider, provider),
          eq(apiKeysPool.isExhausted, false),
        ),
      )
      // nulls first so brand-new keys (never used) take priority over stale ones
      .orderBy(sql`${apiKeysPool.lastUsedAt} ASC NULLS FIRST`, asc(apiKeysPool.createdAt))

    if (keys.length > 0) {
      const next = keys[0]
      const rawValue = safeDecrypt(next.value)
      await bumpUsage(next.id)
      return { id: next.id, provider, rawValue, source: 'pool' }
    }

    // No healthy pool key for this provider – fall through to the env var
    // before giving up on this provider entirely.
    const envValue = envKeyForProvider(provider)
    if (envValue) {
      return { id: `env:${provider}`, provider, rawValue: envValue, source: 'env' }
    }
  }

  throw new AllKeysExhaustedError(functionName)
}

async function selectFromEnvironmentOnly(functionName: FunctionValue): Promise<SelectedApiKey> {
  const pref = DEFAULT_FUNCTION_ROUTING[functionName].preferredProviders
  for (const provider of pref) {
    const envValue = envKeyForProvider(provider)
    if (envValue) {
      return { id: `env:${provider}`, provider, rawValue: envValue, source: 'env' }
    }
  }
  throw new AllKeysExhaustedError(functionName)
}

async function resolveRouting(userId: string, functionName: FunctionValue) {
  const persisted = await db
    .select()
    .from(functionRouting)
    .where(and(eq(functionRouting.userId, userId), eq(functionRouting.functionName, functionName)))
    .limit(1)
  if (persisted[0]) {
    return {
      preferredProviders: persisted[0].preferredProviders as ProviderValue[],
      defaultModel: persisted[0].defaultModel,
    }
  }
  // Insert the default and return it – keeps the UI in sync without forcing
  // the user to first visit settings.
  const defaults = DEFAULT_FUNCTION_ROUTING[functionName]
  const id = `routing-${userId}-${functionName}`
  try {
    await db.insert(functionRouting).values({
      id,
      userId,
      functionName,
      preferredProviders: defaults.preferredProviders,
      defaultModel: defaults.defaultModel,
    })
  } catch {
    // Unique constraint race – another request inserted first; safe to ignore.
  }
  return defaults
}

/** Best-effort usage tracking. Failures are swallowed so they can never break a call. */
async function bumpUsage(keyId: string) {
  if (keyId.startsWith('env:')) return
  try {
    const today = todayUtc()
    await db
      .update(apiKeysPool)
      .set({
        usageCount: sql`${apiKeysPool.usageCount} + 1`,
        lastUsedAt: new Date(),
        quotaWindowDay: today,
        updatedAt: new Date(),
      })
      .where(eq(apiKeysPool.id, keyId))
  } catch {
    // Quota is informational – never propagate the failure.
  }
}

export async function markKeyExhausted(keyId: string): Promise<void> {
  if (!keyId || keyId.startsWith('env:')) return
  try {
    await db
      .update(apiKeysPool)
      .set({
        isExhausted: true,
        exhaustedAt: new Date(),
        quotaWindowDay: todayUtc(),
        updatedAt: new Date(),
      })
      .where(eq(apiKeysPool.id, keyId))
  } catch {
    // ignore – the next round-robin will pick the next key anyway
  }
}

export async function resetKeyExhausted(keyId: string): Promise<void> {
  if (!keyId || keyId.startsWith('env:')) return
  try {
    await db
      .update(apiKeysPool)
      .set({ isExhausted: false, usageCount: 0, lastUsedAt: null, exhaustedAt: null, updatedAt: new Date() })
      .where(eq(apiKeysPool.id, keyId))
  } catch {
    // ignore
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value)
  } catch {
    // Could be a value that was stored before encryption was required (e.g.
    // a hand-rolled migration). Treat it as already-plaintext.
    return value
  }
}

/** Wraps an async LLM call and retries with the next pool key on 429/quota errors. */
export async function runWithKeyRotation<T>(
  functionName: FunctionValue,
  call: (key: SelectedApiKey) => Promise<T>,
  opts: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let selected: SelectedApiKey
    try {
      selected = await selectApiKeyForFunction(functionName)
    } catch (err) {
      if (err instanceof AllKeysExhaustedError) throw err
      throw err
    }
    try {
      return await call(selected)
    } catch (err) {
      lastError = err
      if (isQuotaError(err)) {
        await markKeyExhausted(selected.id)
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('runWithKeyRotation failed')
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as { status?: number; statusCode?: number; code?: string; message?: string }
  const status = anyErr.status ?? anyErr.statusCode
  if (status === 429) return true
  if (anyErr.code && typeof anyErr.code === 'string' && anyErr.code.toLowerCase().includes('quota')) return true
  if (anyErr.message && /quota|rate.?limit|429/i.test(anyErr.message)) return true
  return false
}
