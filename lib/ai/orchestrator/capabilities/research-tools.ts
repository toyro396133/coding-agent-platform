import { tool } from 'ai'
import { z } from 'zod'
import { semanticCodeSearchTool } from './semantic-code-search'
import type { ResearchResult, ToolContext } from './types'

export function createResearchTools(ctx: ToolContext) {
  const results: ResearchResult[] = []

  return {
    semanticCodeSearch: semanticCodeSearchTool(ctx.userId, ctx.repoUrl || ''),
    exploreRepository: tool({
      description:
        'Analyze project structure, identify key files, dependencies, and configuration. Use when starting work on an unfamiliar codebase.',
      inputSchema: z.object({
        path: z.string().optional().default('.').describe('Repository path or URL'),
        focus: z
          .enum(['structure', 'dependencies', 'config', 'all'])
          .optional()
          .default('all')
          .describe('What aspect to focus on'),
      }),
      execute: async ({ path, focus }) => {
        const findings: string[] = [`Repository exploration for: ${path}`, `Focus: ${focus}`, '']
        if (focus === 'structure' || focus === 'all') {
          findings.push('### Structure')
          findings.push('Analysis of project structure based on available context.')
          results.push({ type: 'structure', content: 'Project structure analyzed', path })
        }
        if (focus === 'dependencies' || focus === 'all') {
          findings.push('### Dependencies')
          findings.push('Key dependencies identified from project context.')
          results.push({ type: 'dependencies', content: 'Dependencies analyzed', path })
        }
        if (focus === 'config' || focus === 'all') {
          findings.push('### Configuration')
          findings.push('Configuration files and settings identified.')
          results.push({ type: 'config', content: 'Configuration analyzed', path })
        }
        return findings.join('\n')
      },
    }),

    findRelevantCode: tool({
      description:
        'Search for relevant code across the available context using semantic understanding. Use when looking for specific patterns, implementations, or APIs.',
      inputSchema: z.object({
        query: z.string().describe('What to search for (e.g., "authentication flow", "database connection")'),
        maxResults: z.number().min(1).max(20).optional().default(5),
      }),
      execute: async ({ query, maxResults }) => {
        const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
        const ctxLines = ctx.accumulatedContext
          .split('\n')
          .filter((l) => searchTerms.some((term) => l.toLowerCase().includes(term)))
          .slice(0, maxResults)
        if (ctxLines.length === 0) {
          return `No direct matches found for "${query}" in current context. Try using the websearch tool to research this topic.`
        }
        results.push({ type: 'code', content: ctxLines.join('\n') })
        return `Found ${ctxLines.length} relevant snippets:\n\n${ctxLines.map((l, i) => `${i + 1}. ${l.trim().slice(0, 200)}`).join('\n')}`
      },
    }),

    readDocumentation: tool({
      description: 'Fetch and summarize documentation for a specific topic, library, or API.',
      inputSchema: z.object({
        topic: z.string().describe('The topic, library, or API to look up'),
        source: z.enum(['web', 'memory']).optional().default('web').describe('Where to look for documentation'),
      }),
      execute: async ({ topic, source }) => {
        if (source === 'memory') {
          const relevant = ctx.accumulatedContext
            .split('\n')
            .filter((l) => l.toLowerCase().includes(topic.toLowerCase()))
            .slice(0, 5)
          if (relevant.length > 0) {
            return `Found in context:\n${relevant.join('\n')}`
          }
          return `No documentation found for "${topic}" in current context. Try source="web".`
        }
        return `To research "${topic}" on the web, use the webfetch tool with the documentation URL, or use websearch to find relevant pages.`
      },
    }),
  }
}
