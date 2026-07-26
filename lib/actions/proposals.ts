'use server'

import { db } from '../db/client'
import { proposalsBank, DEFAULT_FUNCTION_ROUTING, type FunctionValue } from '../db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { revalidatePath } from 'next/cache'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { runWithKeyRotation, AllKeysExhaustedError, type SelectedApiKey } from '@/lib/ai/key-manager'
import { getModelClient, toGatewayModelId } from '@/lib/ai/models'
import { nanoid } from 'nanoid'

/**
 * Retrieves the most recent proposals for the authenticated user.
 *
 * @returns The latest 50 proposals, ordered by creation time
 * @throws Error when no authenticated user is available
 */
export async function fetchProposals() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const proposals = await db.select().from(proposalsBank).orderBy(desc(proposalsBank.createdAt)).limit(50)

  return proposals
}

/**
 * Updates a proposal's status and refreshes the tasks route.
 *
 * @param id - The proposal identifier
 * @param status - The new proposal status
 */
export async function updateProposalStatus(id: string, status: 'accepted' | 'rejected') {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  await db.update(proposalsBank).set({ status }).where(eq(proposalsBank.id, id))

  revalidatePath('/tasks')
}

/**
 * Generates a fresh batch of proposals using the user's preferred providers.
 * Persists them into `proposals_bank` so the existing UI can accept/decline.
 */
export async function generateProposals(opts: { count?: number; topic?: string } = {}) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const count = clamp(opts.count ?? 3, 1, 8)
  const topic = opts.topic?.trim() || 'developer productivity agents'

  const { titles, descriptions, tags } = await runWithKeyRotation('proposals', async (selected) => {
    return callModelForProposals(selected, count, topic)
  })

  const rows = titles.map((title, idx) => ({
    id: nanoid(),
    title: title.slice(0, 140),
    description: descriptions[idx]?.slice(0, 800) ?? '',
    tags: tags[idx] ?? [],
    status: 'pending' as const,
    createdAt: new Date(),
  }))

  if (rows.length > 0) {
    await db.insert(proposalsBank).values(rows)
  }

  revalidatePath('/tasks')
  return rows
}

async function callModelForProposals(
  selected: SelectedApiKey,
  count: number,
  topic: string,
): Promise<{ titles: string[]; descriptions: string[]; tags: string[][] }> {
  const systemPrompt = `You design new experiment ideas for an AI coding-agent platform.
Return STRICT JSON of the shape:
{ "proposals": [ { "title": string, "description": string, "tags": string[] } ] }
Do not include any prose outside the JSON.`

  const userPrompt = `Generate ${count} fresh proposal ideas about: ${topic}.
Each description should be 1–3 sentences and focused on what the platform could improve or build next.
Each proposal should have 1–4 short tags.`

  const model = pickModelFor(selected, 'proposals')

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
  })

  const parsed = safeParseJson(text)
  const proposals = Array.isArray(parsed?.proposals) ? parsed.proposals.slice(0, count) : []

  const titles: string[] = []
  const descriptions: string[] = []
  const tags: string[][] = []
  for (const p of proposals) {
    if (!p || typeof p !== 'object') continue
    const title = typeof p.title === 'string' ? p.title : ''
    const description = typeof p.description === 'string' ? p.description : ''
    const tagList = Array.isArray(p.tags) ? p.tags.filter((t: unknown) => typeof t === 'string').slice(0, 4) : []
    if (!title || !description) continue
    titles.push(title)
    descriptions.push(description)
    tags.push(tagList)
  }
  return { titles, descriptions, tags }
}

function pickModelFor(selected: SelectedApiKey, functionName: FunctionValue): any {
  const defaultModel = DEFAULT_FUNCTION_ROUTING[functionName].defaultModel
  const modelId = selected.provider === 'aigateway' ? toGatewayModelId('gemini', defaultModel) : defaultModel

  if (selected.provider === 'openai' || selected.provider === 'aigateway') {
    const openai = createOpenAI({
      apiKey: selected.rawValue,
      ...(selected.provider === 'aigateway'
        ? { baseURL: process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1' }
        : {}),
    })
    return openai(modelId) as any
  }
  return getModelClient(modelId)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    // Recover when the model wraps JSON in prose or fences.
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

/** Delete several proposals in one round-trip; used by the manager UI. */
export async function deleteProposals(ids: string[]) {
  const session = await getServerSession()
  if (!session?.user?.id) throw new Error('Unauthorized')
  if (!ids || ids.length === 0) return { deleted: 0 }
  await db.delete(proposalsBank).where(inArray(proposalsBank.id, ids))
  revalidatePath('/tasks')
  return { deleted: ids.length }
}

export { AllKeysExhaustedError }
