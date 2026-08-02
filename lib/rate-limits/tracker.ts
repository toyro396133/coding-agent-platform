/**
 * RateLimitTracker — tracks API usage per-provider with DB persistence.
 *
 * Stores usage records in the `provider_usage` table so data survives
 * serverless cold starts. Uses in-memory cache for hot-path reads and
 * flushes writes asynchronously.
 */

import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { providerUsage } from '@/lib/db/schema'
import type { LlmProvider, UsageRecord } from './types'
import { PROVIDER_QUOTAS } from './types'

// ─── In-memory cache ────────────────────────────────────────────────────

const usageCache = new Map<string, UsageRecord>()
let _lastCacheFlush = Date.now()
const _CACHE_TTL_MS = 30_000 // 30 seconds
const _FLUSH_INTERVAL_MS = 5_000 // flush every 5s

// ─── Helpers ────────────────────────────────────────────────────────────

function cacheKey(provider: LlmProvider): string {
  return `usage:${provider}`
}

function computeWindowReset(provider: LlmProvider, now: Date): Date {
  const config = PROVIDER_QUOTAS[provider]
  const windowMs = config.windowMinutes * 60_000
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs + windowMs)
}

function computeWindowStart(provider: LlmProvider, now: Date): Date {
  const config = PROVIDER_QUOTAS[provider]
  const windowMs = config.windowMinutes * 60_000
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

function quotaWindowDay(provider: LlmProvider, now: Date): string {
  const config = PROVIDER_QUOTAS[provider]
  if (config.windowMinutes >= 1440) {
    // Monthly: YYYY-MM
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  }
  // Daily: YYYY-MM-DD
  return now.toISOString().slice(0, 10)
}

// ─── DB Read ────────────────────────────────────────────────────────────

async function loadFromDb(provider: LlmProvider, now: Date): Promise<UsageRecord | null> {
  const windowStart = computeWindowStart(provider, now)
  const _windowResetAt = computeWindowReset(provider, now)
  const day = quotaWindowDay(provider, now)

  try {
    const rows = await db
      .select()
      .from(providerUsage)
      .where(
        and(
          eq(providerUsage.provider, provider),
          eq(providerUsage.quotaWindowDay, day),
          gte(providerUsage.createdAt, windowStart),
        ),
      )
      .orderBy(desc(providerUsage.createdAt))
      .limit(1)

    if (rows.length > 0) {
      const row = rows[0]
      return {
        provider,
        requestCount: row.requestCount,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        windowStart: row.windowStart.getTime(),
        windowResetAt: row.windowReset.getTime(),
        isExhausted: row.isExhausted,
        quotaWindowDay: row.quotaWindowDay,
      }
    }
    return null
  } catch (_error) {
    console.error('Failed to load usage from DB')
    return null
  }
}

function createFreshRecord(provider: LlmProvider, now: Date): UsageRecord {
  const windowStart = computeWindowStart(provider, now)
  const windowResetAt = computeWindowReset(provider, now)
  return {
    provider,
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    windowStart: windowStart.getTime(),
    windowResetAt: windowResetAt.getTime(),
    isExhausted: false,
    quotaWindowDay: quotaWindowDay(provider, now),
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Get the current usage record for a provider.
 * Loads from cache (hot) or DB (cold).
 */
export async function getProviderUsage(provider: LlmProvider): Promise<UsageRecord> {
  const key = cacheKey(provider)
  const now = new Date()
  const nowMs = now.getTime()

  // Check cache
  const cached = usageCache.get(key)
  if (cached) {
    // If window has expired, reset
    if (nowMs >= cached.windowResetAt) {
      const fresh = createFreshRecord(provider, now)
      usageCache.set(key, fresh)
      return fresh
    }
    return cached
  }

  // Load from DB
  const dbRecord = await loadFromDb(provider, now)
  if (dbRecord) {
    usageCache.set(key, dbRecord)
    return dbRecord
  }

  // Fresh start
  const fresh = createFreshRecord(provider, now)
  usageCache.set(key, fresh)
  return fresh
}

/**
 * Record usage for a provider.
 * Call this after every successful API call.
 */
export async function recordUsage(params: {
  provider: LlmProvider
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const now = new Date()
  const nowMs = now.getTime()
  const usage = await getProviderUsage(params.provider)

  // If window has expired, reset
  if (nowMs >= usage.windowResetAt) {
    usage.requestCount = 0
    usage.inputTokens = 0
    usage.outputTokens = 0
    usage.windowStart = computeWindowStart(params.provider, now).getTime()
    usage.windowResetAt = computeWindowReset(params.provider, now).getTime()
    usage.quotaWindowDay = quotaWindowDay(params.provider, now)
    usage.isExhausted = false
  }

  usage.requestCount++
  usage.inputTokens += params.inputTokens
  usage.outputTokens += params.outputTokens

  // Check exhaustion
  const config = PROVIDER_QUOTAS[params.provider]
  if (
    usage.requestCount >= config.maxRequestsPerWindow ||
    usage.inputTokens + usage.outputTokens >= config.maxTokensPerWindow
  ) {
    usage.isExhausted = true
  }

  // Update cache
  usageCache.set(cacheKey(params.provider), usage)

  // Async flush to DB
  flushToDb(params.provider, usage).catch(() => {})
}

/**
 * Mark a provider as exhausted (e.g., after a 429 response).
 */
export async function markProviderExhausted(provider: LlmProvider): Promise<void> {
  const usage = await getProviderUsage(provider)
  usage.isExhausted = true
  usageCache.set(cacheKey(provider), usage)
  flushToDb(provider, usage).catch(() => {})
}

/**
 * Get remaining capacity for a provider.
 */
export async function getProviderCapacity(provider: LlmProvider): Promise<{
  requestsRemaining: number
  tokensRemaining: number
  isExhausted: boolean
  windowResetInMs: number
}> {
  const usage = await getProviderUsage(provider)
  const config = PROVIDER_QUOTAS[provider]

  return {
    requestsRemaining: Math.max(0, config.maxRequestsPerWindow - usage.requestCount),
    tokensRemaining: Math.max(0, config.maxTokensPerWindow - (usage.inputTokens + usage.outputTokens)),
    isExhausted: usage.isExhausted,
    windowResetInMs: Math.max(0, usage.windowResetAt - Date.now()),
  }
}

// ─── DB Flush ───────────────────────────────────────────────────────────

async function flushToDb(provider: LlmProvider, record: UsageRecord): Promise<void> {
  try {
    const now = new Date()
    const deterministicId = `usage-${provider}-${record.quotaWindowDay}`
    await db
      .insert(providerUsage)
      .values({
        id: deterministicId,
        provider,
        requestCount: record.requestCount,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        windowStart: new Date(record.windowStart),
        windowReset: new Date(record.windowResetAt),
        isExhausted: record.isExhausted,
        quotaWindowDay: record.quotaWindowDay,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerUsage.id,
        set: {
          requestCount: record.requestCount,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          isExhausted: record.isExhausted,
          windowReset: new Date(record.windowResetAt),
          updatedAt: now,
        },
      })
  } catch (_error) {
    // Non-critical — cache is still available
    console.error('Failed to flush usage to DB')
  }
}

/**
 * Periodic flush of all cached usage records to DB.
 * Call this from a cron job or serverless function.
 */
export async function flushAllUsage(): Promise<void> {
  const promises: Promise<void>[] = []
  for (const [key, record] of usageCache) {
    const provider = key.replace('usage:', '') as LlmProvider
    promises.push(flushToDb(provider, record))
  }
  await Promise.allSettled(promises)
  _lastCacheFlush = Date.now()
}
