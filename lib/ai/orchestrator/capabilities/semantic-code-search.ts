import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { generateEmbedding } from '@/lib/memory/engine'
import { sql } from 'drizzle-orm'

export const semanticCodeSearchTool = (userId: string, repoUrl: string) => {
  return tool({
    description:
      "Search the codebase semantically using natural language. Useful for finding related code, functions, or concepts even if you don't know the exact keyword.",
    inputSchema: z.object({
      query: z.string().describe('The natural language query to search for in the codebase.'),
      limit: z.number().optional().default(5).describe('The maximum number of results to return.'),
    }),
    execute: async (params: { query: string; limit: number }) => {
      try {
        const { query, limit } = params
        const normalizedLimit = Math.max(1, Math.min(Math.floor(limit), 20))

        const embedding = await generateEmbedding(query)
        const embeddingArray = `[${embedding.join(',')}]`

        const results = await db.execute<{ id: string; file_path: string; content: string; similarity: number }>(sql`
          SELECT
            id,
            file_path,
            content,
            1 - (embedding <=> ${embeddingArray}::vector) as similarity
          FROM repository_embeddings
          WHERE user_id = ${userId}
            AND repo_url = ${repoUrl}
            AND 1 - (embedding <=> ${embeddingArray}::vector) > 0.3
          ORDER BY similarity DESC
          LIMIT ${normalizedLimit}
        `)

        if (results.length === 0) {
          return 'No semantically similar code found for your query.'
        }

        const formattedResults = results
          .map((r: any) => `File: ${r.file_path} (Similarity: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`)
          .join('\n\n---\n\n')

        return formattedResults
      } catch (error: any) {
        console.error('Semantic search failed')
        return `Failed to search the codebase. Please try again or use a different query.`
      }
    },
  })
}
