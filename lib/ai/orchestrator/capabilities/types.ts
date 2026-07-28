export type CapabilityLevel = 'basic' | 'enhanced' | 'auto'

export interface CapabilityPack {
  name: string
  tools: Record<string, ToolDefinition>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (...args: unknown[]) => Promise<string>
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'blocked'
  dependsOn: string[]
}

export interface Checkpoint {
  id: string
  label: string
  timestamp: Date
  context: string
  subAgentResults: unknown[]
}

export interface BackgroundTask {
  id: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: string
  createdAt: Date
}

export interface ResearchResult {
  type: 'structure' | 'dependencies' | 'config' | 'code'
  content: string
  path?: string
}

export interface ToolContext {
  taskId: string
  userId: string
  repoUrl?: string
  capabilityLevel: CapabilityLevel
  accumulatedContext: string
  subAgentResults: { type: string; prompt: string; result: string }[]
  checkpoint: (label: string) => Promise<string>
  restore: (id: string) => Promise<void>
}
