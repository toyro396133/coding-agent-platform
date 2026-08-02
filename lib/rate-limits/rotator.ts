/**
 * ApiKeyRotator — automatically rotates between multiple API keys per provider.
 *
 * When a key is exhausted (429 or usage limit hit), the rotator:
 * 1. Marks the key as exhausted with a reset timestamp
 * 2. Selects the next healthy key for the provider
 * 3. Falls back to the next provider in the preferred order
 * 4. Returns the selected key or null if all providers are exhausted
 */

import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { poolApiKeys } from '@/lib/db/schema'
import type { KeyStatus, LlmProvider } from './types'

// ─── Provider fallback order ────────────────────────────────────────────

/**
 * Preferred provider rotation order.
 * When the first provider is exhausted, we try the next, and so on.
 * Custom user keys (isUserKey: true) are always preferred over platform keys.
 */
export const PROVIDER_FALLBACK_ORDER: LlmProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'cursor',
  'aigateway',
]

// ─── In-memory key health cache ─────────────────────────────────────────

const keyHealthCache = new Map<string, KeyStatus>()
let lastKeyFetch = 0
const KEY_CACHE_TTL_MS = 60_000 // 1 minute

// ─── DB helpers ─────────────────────────────────────────────────────────

async function loadKeysFromDb(provider?: LlmProvider): Promise<KeyStatus[]> {
  try {
    const conditions = [isNull(poolApiKeys.deletedAt)]
    if (provider) {
      conditions.push(eq(poolApiKeys.provider, provider))
    }

    const rows = await db
      .select()
      .from(poolApiKeys)
      .where(and(...conditions))

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      provider: row.provider as LlmProvider,
      healthy: !row.isExhausted,
      usageCount: row.usageCount,
      lastUsedAt: row.lastUsedAt,
      exhaustedAt: row.exhaustedAt,
      quotaResetMinutes: row.quotaResetMinutes,
    }))
  } catch (_error) {
    console.error('Failed to load pool keys from DB')
    return []
  }
}

async function refreshKeyCache(): Promise<void> {
  if (Date.now() - lastKeyFetch < KEY_CACHE_TTL_MS) return
  const allKeys = await loadKeysFromDb()
  keyHealthCache.clear()
  for (const key of allKeys) {
    keyHealthCache.set(key.id, key)
  }
  lastKeyFetch = Date.now()
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Get all healthy keys for a specific provider.
 */
export async function getHealthyKeys(provider: LlmProvider): Promise<KeyStatus[]> {
  await refreshKeyCache()
  return Array.from(keyHealthCache.values()).filter((k) => k.provider === provider && k.healthy)
}

/**
 * Get the best available key for a provider.
 * Returns the key with the fewest usage count (load balancing).
 */
export async function selectBestKey(provider: LlmProvider): Promise<KeyStatus | null> {
  const healthy = await getHealthyKeys(provider)
  if (healthy.length === 0) return null
  // Least-used key wins (round-robin style)
  return healthy.sort((a, b) => a.usageCount - b.usageCount)[0]
}

/**
 * Mark a key as exhausted (called after 429 or usage limit).
 */
export async function exhaustKey(keyId: string, resetMinutes?: number): Promise<void> {
  const resetAt = new Date(Date.now() + (resetMinutes ?? 60) * 60_000)
  try {
    await db
      .update(poolApiKeys)
      .set({
        isExhausted: true,
        exhaustedAt: resetAt,
        updatedAt: new Date(),
      })
      .where(eq(poolApiKeys.id, keyId))

    // Update cache
    const cached = keyHealthCache.get(keyId)
    if (cached) {
      cached.healthy = false
      cached.exhaustedAt = resetAt
    }
  } catch (_error) {
    console.error('Failed to exhaust key')
  }
}

/**
 * Reset all expired exhausted keys so they can be used again.
 * Call this before selecting a key.
 */
export async function resetExpiredKeys(provider?: LlmProvider): Promise<number> {
  const now = new Date()
  try {
    const conditions = [
      eq(poolApiKeys.isExhausted, true),
      sql`${poolApiKeys.exhaustedAt} IS NOT NULL`,
      sql`${poolApiKeys.exhaustedAt} <= ${now.toISOString()}`,
    ]
    if (provider) {
      conditions.push(eq(poolApiKeys.provider, provider))
    }

    const result = await db
      .update(poolApiKeys)
      .set({
        isExhausted: false,
        exhaustedAt: null,
        updatedAt: now,
      })
      .where(and(...conditions))
      .returning({ id: poolApiKeys.id })

    // Update cache
    for (const row of result) {
      const cached = keyHealthCache.get(row.id)
      if (cached) {
        cached.healthy = true
        cached.exhaustedAt = null
      }
    }

    return result.length
  } catch (_error) {
    console.error('Failed to reset expired keys')
    return 0
  }
}

/**
 * Record usage for a key (increments usage count, updates lastUsedAt).
 */
export async function recordKeyUsage(keyId: string): Promise<void> {
  const now = new Date()
  try {
    await db
      .update(poolApiKeys)
      .set({
        usageCount: sql`${poolApiKeys.usageCount} + 1`,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(poolApiKeys.id, keyId))

    const cached = keyHealthCache.get(keyId)
    if (cached) {
      cached.usageCount++
      cached.lastUsedAt = now
    }
  } catch (_error) {
    console.error('Failed to record key usage')
  }
}

/**
 * Resolve the best key across providers with fallback.
 * Returns { key, provider } or null if all are exhausted.
 */
export async function resolveApiKey(
  preferredProviders: LlmProvider[],
): Promise<{ key: KeyStatus; provider: LlmProvider } | null> {
  // First: reset any expired keys
  await resetExpiredKeys()

  // Try each provider in order
  for (const provider of preferredProviders) {
    const key = await selectBestKey(provider)
    if (key) {
      return { key, provider }
    }
  }

  // Fallback: try all providers
  for (const provider of PROVIDER_FALLBACK_ORDER) {
    if (preferredProviders.includes(provider)) continue // already tried
    const key = await selectBestKey(provider)
    if (key) {
      return { key, provider }
    }
  }

  return null
}

/**
 * Build a strict priority list from a user's configured provider order.
 */
export function buildProviderPriority(orderedProviders: LlmProvider[]): LlmProvider[] {
  const priority: LlmProvider[] = []
  const seen = new Set<LlmProvider>()

  // User-configured order first
  for (const p of orderedProviders) {
    if (!seen.has(p)) {
      priority.push(p)
      seen.add(p)
    }
  }

  // Fill in remaining providers
  for (const p of PROVIDER_FALLBACK_ORDER) {
    if (!seen.has(p)) {
      priority.push(p)
      seen.add(p)
    }
  }

  return priority
}
