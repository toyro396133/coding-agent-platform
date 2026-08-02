import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from './client'
import { type InsertMemory, memories } from './schema'

export async function createMemory(data: Omit<InsertMemory, 'id'> & { embedding: number[] }) {
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
  return db.select().from(memories).where(eq(memories.userId, userId))
}
