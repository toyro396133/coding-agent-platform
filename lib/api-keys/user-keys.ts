import 'server-only'

import { db } from '@/lib/db/client'
import { apiKeysPool, keys, type ProviderValue } from '@/lib/db/schema'
import { and, eq, asc, sql } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { decrypt } from '@/lib/crypto'

export type Provider = ProviderValue

export type UserApiKeys = {
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
  DEEPSEEK_API_KEY: string | undefined
}

const envFallback = (provider: Provider): string | undefined => {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY
    case 'gemini':
      return process.env.GEMINI_API_KEY
    case 'cursor':
      return process.env.CURSOR_API_KEY
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY
    case 'aigateway':
      return process.env.AI_GATEWAY_API_KEY
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY
  }
}

const providerToKeyName: Record<Provider, keyof UserApiKeys> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cursor: 'CURSOR_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  aigateway: 'AI_GATEWAY_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
}

/**
 * Backwards-compatible view of the user's API keys. Reads from the new
 * `api_keys_pool` table when available, with the legacy `keys` table acting
 * as a final read-only fallback so pre-upgrade accounts keep working until
 * the user re-saves their keys in the new UI.
 */
export async function getUserApiKeys(): Promise<UserApiKeys> {
  const apiKeys: UserApiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  }

  const session = await getServerSession()
  if (!session?.user?.id) return apiKeys

  await fillFromPool(session.user.id, apiKeys)
  await fillFromLegacyTable(session.user.id, apiKeys)

  return apiKeys
}

/**
 * Returns a single key value for a provider. Reads from the pool first, then
 * the legacy `keys` table, then the environment variable as a last resort.
 */
export async function getUserApiKey(provider: Provider): Promise<string | undefined> {
  const session = await getServerSession()
  if (!session?.user?.id) return envFallback(provider)

  const fromPool = await pickFromPool(session.user.id, provider)
  if (fromPool) return tryDecrypt(fromPool)

  const fromLegacy = await pickFromLegacy(session.user.id, provider)
  if (fromLegacy) return tryDecrypt(fromLegacy)

  return envFallback(provider)
}

async function fillFromPool(userId: string, apiKeys: UserApiKeys) {
  try {
    const rows = await db
      .select()
      .from(apiKeysPool)
      .where(and(eq(apiKeysPool.userId, userId), eq(apiKeysPool.functionName, 'global')))
      // Pick the most-recently-created so the UI flat-list still matches the
      // first key the user stored, even after we rotate internally.
      .orderBy(asc(apiKeysPool.createdAt))

    for (const row of rows) {
      const keyName = providerToKeyName[row.provider]
      if (!apiKeys[keyName]) {
        apiKeys[keyName] = tryDecrypt(row.value)
      }
    }
  } catch {
    // Fall back to env + legacy below.
  }
}

async function fillFromLegacyTable(userId: string, apiKeys: UserApiKeys) {
  try {
    const rows = await db.select().from(keys).where(eq(keys.userId, userId))
    for (const row of rows) {
      const keyName = providerToKeyName[row.provider as Provider]
      if (!apiKeys[keyName]) {
        apiKeys[keyName] = tryDecrypt(row.value)
      }
    }
  } catch {
    // Ignored – legacy table may not exist in some environments.
  }
}

async function pickFromPool(userId: string, provider: Provider): Promise<string | null> {
  try {
    const rows = await db
      .select({ value: apiKeysPool.value })
      .from(apiKeysPool)
      .where(
        and(
          eq(apiKeysPool.userId, userId),
          eq(apiKeysPool.functionName, 'global'),
          eq(apiKeysPool.provider, provider),
          eq(apiKeysPool.isExhausted, false),
        ),
      )
      .orderBy(sql`${apiKeysPool.lastUsedAt} ASC NULLS FIRST`)
      .limit(1)
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

async function pickFromLegacy(userId: string, provider: Provider): Promise<string | null> {
  try {
    const rows = await db
      .select({ value: keys.value })
      .from(keys)
      .where(and(eq(keys.userId, userId), eq(keys.provider, provider)))
      .limit(1)
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

function tryDecrypt(value: string): string {
  try {
    return decrypt(value)
  } catch {
    return value
  }
}
