/**
 * Shared types for the auto verification pipeline.
 * Used by both server-side pipeline code and client-side UI components.
 */

export interface PipelineStageData {
  name: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  duration?: number
  error?: string
  output?: string
}

export interface PipelineResult {
  success: boolean
  stages: PipelineStageData[]
  commitMessage?: string
  commitSha?: string
  prUrl?: string
  prNumber?: number
  deploymentUrl?: string
  duration: number
}
