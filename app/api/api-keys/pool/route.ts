import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import {
  apiKeysPool,
  functionRouting,
  DEFAULT_FUNCTION_ROUTING,
  type FunctionValue,
  type ProviderValue,
} from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encrypt } from '@/lib/crypto'

const VALID_PROVIDERS: ProviderValue[] = ['openai', 'anthropic', 'gemini', 'cursor', 'aigateway', 'deepseek']
const VALID_FUNCTIONS: FunctionValue[] = ['global', 'prompt-optimizer', 'proposals']

function sanitizeLabel(label: string): string {
  const trimmed = label.trim()
  return trimmed.length === 0 ? 'Key' : trimmed.slice(0, 60)
}

/** GET – list pool entries for the signed-in user, grouped by function. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const requestedFunction = searchParams.get('function') as FunctionValue | null
    const functions: FunctionValue[] =
      requestedFunction && VALID_FUNCTIONS.includes(requestedFunction) ? [requestedFunction] : VALID_FUNCTIONS

    const keys = await db
      .select({
        id: apiKeysPool.id,
        functionName: apiKeysPool.functionName,
        provider: apiKeysPool.provider,
        label: apiKeysPool.label,
        isExhausted: apiKeysPool.isExhausted,
        usageCount: apiKeysPool.usageCount,
        lastUsedAt: apiKeysPool.lastUsedAt,
        quotaWindowDay: apiKeysPool.quotaWindowDay,
        quotaResetMinutes: apiKeysPool.quotaResetMinutes,
        exhaustedAt: apiKeysPool.exhaustedAt,
        createdAt: apiKeysPool.createdAt,
      })
      .from(apiKeysPool)
      .where(eq(apiKeysPool.userId, session.user.id))
      .orderBy(asc(apiKeysPool.functionName), asc(apiKeysPool.createdAt))

    const routingRows = await db.select().from(functionRouting).where(eq(functionRouting.userId, session.user.id))

    const summary = functions.map((fn) => {
      const persisted = routingRows.find((r) => r.functionName === fn)
      const routing = persisted
        ? {
            preferredProviders: persisted.preferredProviders as ProviderValue[],
            defaultModel: persisted.defaultModel,
          }
        : DEFAULT_FUNCTION_ROUTING[fn]
      return {
        functionName: fn,
        preferredProviders: routing.preferredProviders,
        defaultModel: routing.defaultModel,
        keys: keys
          .filter((k) => k.functionName === fn)
          .map((k) => ({
            id: k.id,
            provider: k.provider,
            label: k.label,
            isExhausted: k.isExhausted,
            usageCount: k.usageCount,
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            quotaWindowDay: k.quotaWindowDay,
            quotaResetMinutes: k.quotaResetMinutes,
            exhaustedAt: k.exhaustedAt ? k.exhaustedAt.toISOString() : null,
          })),
      }
    })

    return NextResponse.json({ success: true, pool: summary })
  } catch (error) {
    console.error('Error fetching API key pool', error)
    return NextResponse.json({ error: 'Failed to fetch API key pool' }, { status: 500 })
  }
}

/** POST – insert a new key into the pool. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const functionName = body.functionName as FunctionValue
    const provider = body.provider as ProviderValue
    const label = sanitizeLabel(String(body.label ?? ''))
    const apiKey = String(body.apiKey ?? '')

    if (!VALID_FUNCTIONS.includes(functionName)) {
      return NextResponse.json({ error: 'Invalid functionName' }, { status: 400 })
    }
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }
    if (!apiKey.trim()) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Cap how many keys one user can register per pool to avoid floods.
    const existing = await db
      .select({ id: apiKeysPool.id })
      .from(apiKeysPool)
      .where(
        and(
          eq(apiKeysPool.userId, session.user.id),
          eq(apiKeysPool.functionName, functionName),
          eq(apiKeysPool.provider, provider),
        ),
      )
    if (existing.length >= 20) {
      return NextResponse.json({ error: 'Too many keys in this pool' }, { status: 400 })
    }

    const encrypted = encrypt(apiKey)

    await db.insert(apiKeysPool).values({
      id: nanoid(),
      userId: session.user.id,
      functionName,
      provider,
      label,
      value: encrypted,
      isExhausted: false,
      usageCount: 0,
      lastUsedAt: null,
      quotaWindowDay: null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving pool key', error)
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
  }
}

/** DELETE – remove a single pool entry by id. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Pool entry id is required' }, { status: 400 })
    }

    await db.delete(apiKeysPool).where(and(eq(apiKeysPool.userId, session.user.id), eq(apiKeysPool.id, id)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting pool key', error)
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }
}
