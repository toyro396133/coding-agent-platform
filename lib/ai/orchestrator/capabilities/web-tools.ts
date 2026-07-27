import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createWebTools(ctx: ToolContext) {
  return {
    webfetch: tool({
      description:
        'Fetch content from a URL and return it as markdown or text. Use for reading documentation, APIs, or web pages.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
        format: z.enum(['markdown', 'text', 'html']).optional().default('markdown').describe('Output format'),
      }),
      execute: async ({ url, format }) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const response = await fetch(url, { signal: controller.signal })
          clearTimeout(timeout)
          if (!response.ok) return `Error: HTTP ${response.status} ${response.statusText}`
          const text = await response.text()
          if (format === 'text') return text.replace(/<[^>]+>/g, '').slice(0, 10000)
          if (format === 'html') return text.slice(0, 10000)
          const cleaned = text
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 10000)
          return cleaned || 'No content returned'
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return 'Error: Request timed out after 15 seconds'
          }
          return `Error fetching URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    websearch: tool({
      description:
        'Search the web for information. Use for researching topics, finding documentation, looking up APIs, and gathering context.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        numResults: z.number().min(1).max(10).optional().default(5).describe('Number of results to return'),
      }),
      execute: async ({ query, numResults }) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000)
          const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          clearTimeout(timeout)
          if (!response.ok) return `Search failed with HTTP ${response.status}`
          const html = await response.text()
          const titles: string[] = []
          const links: string[] = []
          const snippets: string[] = []

          const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
          let match
          while ((match = linkRegex.exec(html)) !== null && titles.length < numResults) {
            links.push(
              match[1]
                ?.replace(/&amp;/g, '&')
                .replace(/<[^>]+>/g, '')
                .trim() || '',
            )
            titles.push(match[2]?.replace(/<[^>]+>/g, '').trim() || '')
          }

          const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
          while ((match = snippetRegex.exec(html)) !== null && snippets.length < numResults) {
            snippets.push(match[1]?.replace(/<[^>]+>/g, '').trim() || '')
          }

          const formatted = titles
            .map((title, i) => {
              const link = links[i] || ''
              const snippet = snippets[i] || ''
              return `${i + 1}. ${title}\n   URL: ${link}\n   ${snippet}`
            })
            .join('\n\n')

          return formatted || 'No results found'
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return 'Search timed out'
          return `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
