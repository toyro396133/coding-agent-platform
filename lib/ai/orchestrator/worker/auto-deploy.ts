import { routePrompt } from '@/lib/ai/router'
import { composeAgentTeam } from '@/lib/ai/orchestrator/loop'
import { deployWorkerTeam, mergeWorkerPatches } from './worker-manager'
import type { AgentType } from '@/lib/sandbox/agents'
import type { WorkerSpec, WorkerTeamSpec, WorkerTeamResult } from './types'

// ─── Types ──────────────────────────────────────────────────────────────

export interface AutoDeployConfig {
  /** Minimum complexity (1-10) to trigger auto-deploy. Default 6 */
  complexityThreshold?: number
  /** Maximum number of workers to deploy. Default 8 */
  maxWorkers?: number
}

export interface AutoDeployResult {
  /** Whether workers were deployed */
  deployed: boolean
  /** The team result if deployed */
  teamResult?: WorkerTeamResult
  /** Human-readable summary */
  summary?: string
  /** Error message if deployment failed */
  error?: string
}

// ─── Agent Team Member Type ─────────────────────────────────────────────

interface AgentTeamMember {
  role: string
  specialty: string
  model: string
}

// ─── Auto-Deploy ────────────────────────────────────────────────────────

export interface AutoDeployParams {
  prompt: string
  repoUrl: string
  branchName: string
  taskId: string
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  }
  githubToken?: string | null
  gitAuthorName?: string
  gitAuthorEmail?: string
  /** Optional: if provided, worker patches are merged into this sandbox */
  mainSandbox?: any | null
  /** Optional logger for progress updates */
  logger?: {
    info: (msg: string) => Promise<void>
    error: (msg: string) => Promise<void>
    success: (msg: string) => Promise<void>
    updateProgress: (pct: number, msg: string) => Promise<void>
  }
  config?: AutoDeployConfig
}

/**
 * Analyze the prompt and automatically deploy parallel worker agents
 * if the task complexity warrants it. Falls back gracefully if:
 * - The task is simple (complexity < threshold)
 * - The team is just the lead engineer (no specialization needed)
 * - Worker deployment fails
 *
 * Returns { deployed: false } in all fallback cases so callers
 * can proceed with standard single-agent execution.
 */
export async function autoDeployWorkerTeam(params: AutoDeployParams): Promise<AutoDeployResult> {
  const {
    prompt,
    repoUrl,
    branchName,
    taskId,
    apiKeys,
    githubToken,
    gitAuthorName,
    gitAuthorEmail,
    mainSandbox,
    logger,
    config = {},
  } = params

  const threshold = config.complexityThreshold ?? 6
  const maxWorkers = config.maxWorkers ?? 8

  try {
    // Step 1: Analyze complexity
    const routing = routePrompt(prompt)
    const complexity = routing.complexity

    if (complexity < threshold) {
      if (logger) await logger.info('Task complexity below threshold, skipping worker team')
      return { deployed: false }
    }

    // Step 2: Compose agent team
    const team = composeAgentTeam(prompt, repoUrl)

    // Only deploy if we have more than just the lead engineer
    if (team.length <= 1) {
      if (logger) await logger.info('No specialized agents needed for this task')
      return { deployed: false }
    }

    const workersToDeploy = Math.min(team.length, maxWorkers)
    if (logger) {
      await logger.info(`Auto-deploying ${workersToDeploy} worker agents for complex task`)
      await logger.updateProgress(55, `Deploying ${workersToDeploy} parallel worker agents...`)
    }

    // Step 3: Build WorkerSpecs from composed team
    const workerSpecs: WorkerSpec[] = team.slice(0, workersToDeploy).map((member, i) => ({
      id: `auto-worker-${i + 1}-${Date.now().toString(36)}`,
      role: member.role,
      agentType: mapSpecialtyToAgent(member.specialty) as AgentType,
      instructions: buildWorkerInstructions(member, prompt, repoUrl),
      model: member.model,
      priority: workersToDeploy - i,
    }))

    const teamSpec: WorkerTeamSpec = {
      workers: workerSpecs,
      repoUrl,
      branchName: `${branchName}-workers`,
      githubToken,
      apiKeys,
      gitAuthorName: gitAuthorName || 'Worker Agent',
      gitAuthorEmail: gitAuthorEmail || 'worker@agent.local',
      timeoutMs: 15 * 60 * 1000, // 15 min hard limit
    }

    // Step 4: Deploy all workers in parallel sandboxes
    const teamResult = await deployWorkerTeam(teamSpec, taskId)

    // Step 5: Merge patches into main sandbox if available
    if (mainSandbox && teamResult.mergedPatch) {
      try {
        if (logger) await logger.info('Merging worker changes into main sandbox...')
        const mergeResult = await mergeWorkerPatches(mainSandbox, teamResult)

        if (!mergeResult.success && logger) {
          await logger.error('Worker merge had conflicts')
        }
      } catch (mergeError) {
        console.error('Failed to merge worker patches:', mergeError)
        if (logger) await logger.error('Failed to merge worker changes')
      }
    }

    // Step 6: Build summary
    const summary = buildTeamSummary(teamResult)

    return {
      deployed: true,
      teamResult,
      summary,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Auto-deploy worker team failed'
    console.error('Auto-deploy worker team error:', error)

    if (logger) {
      await logger.info('Worker team auto-deploy failed, falling back to standard execution')
    }

    return {
      deployed: false,
      error: errorMsg,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Map a team member's specialty to the best agent type.
 */
function mapSpecialtyToAgent(specialty: string): string {
  switch (specialty) {
    case 'ui_implementation':
    case 'test_writing':
      return 'claude'
    case 'api_implementation':
      return 'codex'
    case 'infrastructure':
      return 'gemini'
    default:
      return 'claude'
  }
}

/**
 * Build targeted instructions for each worker based on their role.
 */
function buildWorkerInstructions(member: AgentTeamMember, originalPrompt: string, repoUrl: string): string {
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repository'

  return `You are a ${member.role} working on the project "${repoName}".

YOUR TASK: ${originalPrompt}

YOUR FOCUS: ${member.specialty.replace('_', ' ')}

Guidelines:
- Only modify files relevant to your specialty
- Write clean, well-documented code
- Follow existing project patterns
- Do NOT modify files outside your area of expertise
- Coordinate with other workers via file comments if needed

Working directory: /vercel/sandbox/project`
}

/**
 * Build a human-readable summary of the worker team results.
 */
function buildTeamSummary(teamResult: WorkerTeamResult): string {
  const parts: string[] = [
    `Worker Team Results (${Math.round(teamResult.totalDurationMs / 1000)}s total)`,
    `${teamResult.successCount} succeeded, ${teamResult.failCount} failed`,
    '',
  ]

  for (const r of teamResult.results) {
    const status = r.success ? '✓' : '✗'
    const fileCount = r.changedFiles?.length || 0
    const duration = (r.durationMs / 1000).toFixed(1)
    parts.push(`${status} ${r.role} (${r.agentType}, ${duration}s) — ${fileCount} file(s)`)
    if (r.changedFiles && r.changedFiles.length > 0) {
      for (const file of r.changedFiles.slice(0, 5)) {
        parts.push(`  - ${file}`)
      }
      if (r.changedFiles.length > 5) {
        parts.push(`  … and ${r.changedFiles.length - 5} more`)
      }
    }
    if (!r.success && r.error) {
      parts.push(`  Error: ${r.error}`)
    }
  }

  return parts.join('\n')
}
