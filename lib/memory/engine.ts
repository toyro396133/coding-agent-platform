import { embed, cosineSimilarity } from 'ai'
import { openai } from '@ai-sdk/openai'
import { db } from '../db/client'
import { memories } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const embeddingModel = openai.embedding('text-embedding-3-small') as any

export async function generateEmbedding(text: string) {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  })
  return embedding
}

export async function saveMemory(userId: string, content: string, taskId?: string) {
  const embedding = await generateEmbedding(content)
  const id = nanoid()

  const [memory] = await db
    .insert(memories)
    .values({
      id,
      userId,
      content,
      taskId: taskId || null,
      embedding,
    })
    .returning({ id: memories.id, content: memories.content })

  return memory
}

export async function retrieveRelevantMemories(
  userId: string,
  prompt: string,
  topK: number = 5,
  threshold: number = 0.5,
) {
  // Normalize and validate inputs to prevent DB errors
  const safeTopK = Number.isFinite(topK) ? topK : 5
  const normalizedTopK = Math.max(1, Math.min(Math.floor(safeTopK), 100))
  const safeThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : 0.5
  const normalizedThreshold = Math.max(0, Math.min(safeThreshold, 1))
  const promptEmbedding = await generateEmbedding(prompt)
  const embeddingArray = `[${promptEmbedding.join(',')}]`

  const results = await db.execute<{ id: string; content: string; similarity: number }>(sql`
    SELECT
      id,
      content,
      1 - (embedding <=> ${embeddingArray}::vector) as similarity
    FROM memories
    WHERE user_id = ${userId}
      AND 1 - (embedding <=> ${embeddingArray}::vector) > ${normalizedThreshold}
    ORDER BY similarity DESC
    LIMIT ${normalizedTopK}
  `)

  if (results.length > 0) {
    return results
  }

  // Fallback: 2 most recent memories
  const fallbackResults = await db
    .select({
      id: memories.id,
      content: memories.content,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(sql`${memories.createdAt} DESC`)
    .limit(2)

  return fallbackResults.map((r) => ({ ...r, similarity: 0 }))
}
