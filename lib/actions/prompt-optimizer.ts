'use server'

import { db } from '../db/client'
import { memories } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, embed } from 'ai'

export async function optimizePrompt(rawPrompt: string): Promise<string> {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // 1. Generate embedding for the raw prompt
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small') as any,
    value: rawPrompt,
  })

  // 2. Perform vector similarity search
  // Using exact vector cosine similarity operator `<=>` supported by pgvector and drizzle
  const embeddingString = `[${embedding.join(',')}]`

  const similarMemories = await db
    .select({ content: memories.content })
    .from(memories)
    .where(eq(memories.userId, session.user.id))
    .orderBy(sql`${memories.embedding} <=> ${embeddingString}::vector`)
    .limit(5)

  const contextContexts = similarMemories.map((m) => m.content).join('\n\n')

  // 3. Call LLM to enhance the prompt
  const systemPrompt = `You are an expert software engineering assistant.
Your goal is to optimize a user's prompt by incorporating relevant context from their past interactions and memories.
Use the provided semantic context to clarify the user's intent, add useful constraints, and make the prompt more precise.
If the context is irrelevant to the current prompt, you can ignore it or use it lightly.
Do not change the fundamental goal of the user's prompt, just improve its clarity and depth.
Output ONLY the enhanced prompt.`

  const promptWithContext = `Original Prompt:
${rawPrompt}

Relevant Context from Past Memories:
${contextContexts ? contextContexts : 'No relevant past memories found.'}

Please provide the enhanced prompt:`

  const { text: enhancedPrompt } = await generateText({
    model: openai('gpt-4o') as any,
    system: systemPrompt,
    prompt: promptWithContext,
  })

  return enhancedPrompt.trim()
}
