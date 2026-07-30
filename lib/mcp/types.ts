/**
 * MCP Marketplace types — defines built-in server entries, categories, and install states.
 */

export type McpMarketplaceCategory =
  | 'development'
  | 'project-management'
  | 'communication'
  | 'design'
  | 'infrastructure'
  | 'monitoring'
  | 'database'
  | 'ai'
  | 'other'

export interface McpMarketplaceEnvKey {
  key: string
  label: string
  description?: string
  required: boolean
  /** If true, this env var can be auto-filled from the user's API keys */
  autoFillFrom?: 'GITHUB_TOKEN' | 'AI_GATEWAY_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'
}

export interface McpMarketplaceEntry {
  id: string
  name: string
  description: string
  category: McpMarketplaceCategory
  type: 'local' | 'remote'
  /** STDIO command (for type === 'local') */
  command?: string
  /** HTTP/SSE URL (for type === 'remote') */
  baseUrl?: string
  /** Environment variables this server needs */
  envKeys?: McpMarketplaceEnvKey[]
  /** Emoji icon displayed in the UI */
  icon: string
  /** Link to official MCP documentation */
  docsUrl?: string
  /** Sort weight (higher = shown first) */
  popularity: number
  /** Whether this requires OAuth setup */
  requiresOAuth?: boolean
  /** Free-form install hints shown in the UI */
  installHint?: string
}

export interface McpMarketplaceCategoryInfo {
  id: McpMarketplaceCategory
  label: string
  icon: string
}
