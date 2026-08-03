import type { AgentApiKeys, AgentType } from '@/lib/sandbox/agents'

/**
 * A single worker specification — one agent in a parallel team.
 */
export interface WorkerSpec {
  /** Unique ID for this worker within the team */
  id: string
  /** Human-readable role name (e.g. "Frontend Specialist") */
  role: string
  /** The agent CLI to use inside the worker sandbox */
  agentType: AgentType
  /** Detailed instructions for this worker */
  instructions: string
  /** Optional model override (e.g. "claude-sonnet-4-5") */
  model?: string
  /** Priority for conflict resolution — higher wins when merging */
  priority?: number
}

/**
 * Full team specification — all workers plus shared config.
 */
export interface WorkerTeamSpec {
  workers: WorkerSpec[]
  repoUrl: string
  branchName: string
  githubToken?: string | null
  apiKeys?: AgentApiKeys
  gitAuthorName?: string
  gitAuthorEmail?: string
  /** Total timeout for all workers combined (ms) */
  timeoutMs?: number
}

/**
 * Result from a single worker sandbox.
 */
export interface WorkerResult {
  id: string
  role: string
  agentType: AgentType
  success: boolean
  error?: string
  /** Unified git diff (patch) of all changes made by this worker */
  gitPatch?: string
  /** List of files that were changed/added by this worker */
  changedFiles?: string[]
  /** Textual summary from the agent */
  agentResponse?: string
  /** Wall-clock duration inside the worker sandbox */
  durationMs: number
}

/**
 * Aggregated result for the whole worker team.
 */
export interface WorkerTeamResult {
  results: WorkerResult[]
  /** Combined patch from all successful workers */
  mergedPatch?: string
  /** Files that had merge conflicts (file path → description) */
  mergeConflicts?: { file: string; error: string }[]
  /** Total elapsed time for the whole team */
  totalDurationMs: number
  /** Number of workers that succeeded */
  successCount: number
  /** Number of workers that failed */
  failCount: number
}

/**
 * Internal handle used by the worker manager to track an in-flight worker.
 */
export interface WorkerHandle {
  spec: WorkerSpec
  status: 'creating' | 'running' | 'completed' | 'failed' | 'timeout'
  startTime: number
  sandboxId?: string
}

// ─── Daemon Agent types ──────────────────────────────────────────────────

/**
 * Specification for a daemon agent — a sub-agent that runs in an
 * infinite loop, continuously working until explicitly stopped.
 */
export interface DaemonAgentSpec {
  /** Unique ID for this daemon agent */
  id: string
  /** Human-readable label */
  label: string
  /** Agent CLI to use */
  agentType: AgentType
  /** The task/instructions for the daemon */
  instructions: string
  /** Optional model override */
  model?: string
  /** Interval between loop iterations in ms (default 30s) */
  loopIntervalMs?: number
  /** Max iterations (0 = infinite, default 0) */
  maxIterations?: number
}

/**
 * Current status of a daemon agent.
 */
export interface DaemonAgentStatus {
  id: string
  label: string
  agentType: AgentType
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'error'
  iterations: number
  lastResult?: string
  lastError?: string
  sandboxId?: string
  startedAt: number
  lastIterationAt?: number
}
