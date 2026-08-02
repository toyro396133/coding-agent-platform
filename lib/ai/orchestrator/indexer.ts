import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { repositoryEmbeddings } from '@/lib/db/schema'
import { generateEmbedding } from '@/lib/memory/engine'

function generateDeterministicId(userId: string, repoUrl: string, filePath: string, content: string): string {
  const hash = createHash('sha256')
  hash.update(`${userId}:${repoUrl}:${filePath}:${content}`)
  return hash.digest('hex')
}

export async function indexCodebaseChunk(userId: string, repoUrl: string, filePath: string, content: string) {
  const embedding = await generateEmbedding(content)
  const id = generateDeterministicId(userId, repoUrl, filePath, content)

  await db
    .insert(repositoryEmbeddings)
    .values({
      id,
      userId,
      repoUrl,
      filePath,
      content,
      embedding,
    })
    .onConflictDoUpdate({
      target: repositoryEmbeddings.id,
      set: {
        content,
        embedding,
      },
    })
}

export async function clearRepoEmbeddings(userId: string, repoUrl: string) {
  await db
    .delete(repositoryEmbeddings)
    .where(and(eq(repositoryEmbeddings.userId, userId), eq(repositoryEmbeddings.repoUrl, repoUrl)))
}
