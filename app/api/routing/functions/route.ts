import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { functionRouting, DEFAULT_FUNCTION_ROUTING, type FunctionValue, type ProviderValue } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const VALID_FUNCTIONS: FunctionValue[] = ['global', 'prompt-optimizer', 'proposals']
const VALID_PROVIDERS: ProviderValue[] = ['openai', 'anthropic', 'gemini', 'cursor', 'aigateway', 'deepseek']

/** GET – return routing preferences for every function known to the user. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await db.select().from(functionRouting).where(eq(functionRouting.userId, session.user.id))

    const routing = VALID_FUNCTIONS.map((fn) => {
      const persisted = rows.find((r) => r.functionName === fn)
      if (persisted) {
        return {
          functionName: fn,
          preferredProviders: persisted.preferredProviders as ProviderValue[],
          defaultModel: persisted.defaultModel,
        }
      }
      return { functionName: fn, ...DEFAULT_FUNCTION_ROUTING[fn] }
    })

    return NextResponse.json({ success: true, routing })
  } catch (error) {
    console.error('Error fetching function routing', error)
    return NextResponse.json({ error: 'Failed to fetch routing' }, { status: 500 })
  }
}

/** POST – upsert a function's preferred provider ordering + default model. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const functionName = body.functionName as FunctionValue
    const preferredProviders = Array.isArray(body.preferredProviders)
      ? (body.preferredProviders as ProviderValue[])
      : []
    const defaultModel = String(body.defaultModel ?? '')

    if (!VALID_FUNCTIONS.includes(functionName)) {
      return NextResponse.json({ error: 'Invalid functionName' }, { status: 400 })
    }
    if (preferredProviders.length === 0 || !preferredProviders.every((p) => VALID_PROVIDERS.includes(p))) {
      return NextResponse.json({ error: 'Invalid preferredProviders' }, { status: 400 })
    }
    if (!defaultModel.trim()) {
      return NextResponse.json({ error: 'defaultModel is required' }, { status: 400 })
    }

    await db
      .insert(functionRouting)
      .values({
        id: nanoid(),
        userId: session.user.id,
        functionName,
        preferredProviders,
        defaultModel,
      })
      .onConflictDoUpdate({
        target: [functionRouting.userId, functionRouting.functionName],
        set: { preferredProviders, defaultModel, updatedAt: new Date() },
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating function routing', error)
    return NextResponse.json({ error: 'Failed to update routing' }, { status: 500 })
  }
}
