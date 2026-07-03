import { db } from './client'
import { memories, type InsertMemory } from './schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { insertMemorySchema } from './schema'

export async function createMemory(data: Omit<InsertMemory, 'id'> & { embedding: number[] }) {
  insertMemorySchema.omit({ id: true }).parse(data)
  const id = nanoid()
  const [memory] = await db
    .insert(memories)
    .values({
      ...data,
      id,
    })
    .returning()
  return memory
}

export async function getMemoriesForUser(userId: string) {
  return db
    .select({
      id: memories.id,
      userId: memories.userId,
      taskId: memories.taskId,
      content: memories.content,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
}
