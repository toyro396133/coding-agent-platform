import { db } from '@/lib/db/client'
import { repositoryEmbeddings } from '@/lib/db/schema'
import { generateEmbedding } from '@/lib/memory/engine'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function indexCodebaseChunk(userId: string, repoUrl: string, filePath: string, content: string) {
  const embedding = await generateEmbedding(content)

  await db.insert(repositoryEmbeddings).values({
    id: nanoid(),
    userId,
    repoUrl,
    filePath,
    content,
    embedding,
  })
}

export async function clearRepoEmbeddings(userId: string, repoUrl: string) {
  await db
    .delete(repositoryEmbeddings)
    .where(and(eq(repositoryEmbeddings.userId, userId), eq(repositoryEmbeddings.repoUrl, repoUrl)))
}
