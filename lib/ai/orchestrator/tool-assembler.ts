/**
 * lib/ai/orchestrator/tool-assembler.ts — ToolAssembler.
 *
 * Per the architecture review (candidate 3), the orchestrator's tool
 * registry is assembled from FIVE independent sources:
 *   1. legacy core tools (spawnSubAgent, spawnSubAgents, finalize)
 *   2. the agent-teams tool (deployWorkerTeam) when a multi-member team exists
 *   3. task-queue tools (listTasks, createTask, …) when a userId exists
 *   4. capability packs by capability level
 *   5. the system-control pack when autonomy level is `full`
 *
 * Extracting this gives locality (tool grants are decided in one place) and
 * testability (tool assembly can be unit-tested with a fake ToolContext).
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { AgentApiKeys, AgentType } from '@/lib/sandbox/agents'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import type { TaskLogger } from '@/lib/utils/task-logger'
import { loadCapabilityTools } from './capabilities/index'
import type { AutonomyLevel, CapabilityLevel } from './capabilities/types'
import { loadPackTools } from './runtime/plugin-registry'
import type { AgentTeamMember, OrchestratorState } from './state'
import { createTaskQueueTools } from './task-queue'
import { createOrchestratorTools } from './tools'
import type { WorkerSpec, WorkerTeamSpec } from './worker/types'
import { deployWorkerTeam, mergeWorkerPatches } from './worker/worker-manager'

export interface RunOrchestratorOptions {
  taskId: string
  userId?: string
  repoUrl?: string
  selectedModel?: string
  systemPrompt?: string
  maxSteps?: number
  capabilityLevel?: CapabilityLevel
  autonomyLevel?: AutonomyLevel
  apiKeys?: AgentApiKeys
  githubToken?: string | null
  gitAuthorName?: string
  gitAuthorEmail?: string
}

export interface ToolAssemblyContext {
  state: OrchestratorState
  options: RunOrchestratorOptions
  logger: TaskLogger
  agentTeam: AgentTeamMember[]
}

/**
 * Build the complete tool registry for one orchestrator step.
 * Pure-ish: takes state + options and returns the merged registry.
 */
export function assembleOrchestratorTools(ctx: ToolAssemblyContext): Record<string, any> {
  const { state, options, logger, agentTeam } = ctx
  const level = state.capabilityLevel
  const autonomyLevel = state.autonomyLevel

  const legacyTools = createOrchestratorTools(state)
  let allTools: Record<string, any> = { ...legacyTools }

  // Add Agent Teams tool if we have a multi-member team
  if (agentTeam.length > 1) {
    allTools = { ...allTools, ...buildAgentTeamsTool({ state, options, logger, agentTeam }) }
  }

  // Add Task Queue tools for managing the task queue
  if (options.userId) {
    try {
      const taskQueueTools = createTaskQueueTools(state)
      allTools = { ...allTools, ...taskQueueTools }
    } catch {
      // Best-effort — task queue tools require userId
    }
  }

  if (state.toolContext) {
    // Standard capability packs by level
    if (level !== 'basic') {
      const capTools = loadCapabilityTools(level, state.toolContext)
      allTools = { ...allTools, ...capTools }
    }
    // 100% autonomy: always grant the system-control pack, even in basic mode
    if (autonomyLevel === 'full') {
      const systemTools = loadPackTools('system', state.toolContext)
      allTools = { ...allTools, ...systemTools }
    }
  }

  return allTools
}

// ─── Agent Teams tool ───────────────────────────────────────────────────

/**
 * The `deployWorkerTeam` tool — deploys real sandbox-backed workers in
 * parallel and merges their patches back into the main project.
 */
function buildAgentTeamsTool(ctx: ToolAssemblyContext): Record<string, any> {
  const { state, options, logger, agentTeam } = ctx

  return {
    deployWorkerTeam: tool({
      description: `Deploy a team of AI agent workers, each running in its OWN dedicated Vercel sandbox.
All workers execute in TRUE parallel (not simulated), each with their own agent CLI, filesystem, and environment.
After all workers finish, their code changes are merged back into the main project.

Available team members: ${agentTeam.map((m) => `${m.role} (${m.specialty})`).join(', ')}`,
      inputSchema: z.object({
        workers: z
          .array(
            z.object({
              role: z.string().describe('Role name (e.g. "Frontend Specialist")'),
              specialty: z.string().describe('Area of focus (e.g. "ui_implementation")'),
              instructions: z.string().describe('Detailed task instructions for this worker'),
              agentType: z
                .string()
                .optional()
                .default('claude')
                .describe('Agent CLI to use: claude, cursor, codex, gemini, copilot, opencode'),
              model: z.string().optional().describe('Model override for this worker'),
            }),
          )
          .min(1)
          .max(8)
          .describe('The team of workers to deploy in parallel'),
      }),
      execute: async ({ workers }) => {
        await logger.info('Deploying worker team in real sandboxes...')

        // Map the orchestrator team members to WorkerSpecs
        const workerSpecs: WorkerSpec[] = workers.map((w, i) => ({
          id: `worker-${i + 1}-${Date.now().toString(36)}`,
          role: w.role,
          agentType: (w.agentType || 'claude') as AgentType,
          instructions: w.instructions,
          model: w.model || undefined,
          priority: workers.length - i,
        }))

        if (!options.repoUrl) {
          return '❌ Cannot deploy workers without a repository URL'
        }

        const teamSpec: WorkerTeamSpec = {
          workers: workerSpecs,
          repoUrl: options.repoUrl,
          branchName: `agent/worker-team-${Date.now().toString(36)}`,
          timeoutMs: 15 * 60 * 1000,
          apiKeys: options.apiKeys,
          githubToken: options.githubToken,
          gitAuthorName: options.gitAuthorName,
          gitAuthorEmail: options.gitAuthorEmail,
        }

        try {
          // Deploy all workers in REAL parallel sandboxes
          await logger.info('Creating worker sandboxes (this may take a moment)...')
          const teamResult = await deployWorkerTeam(teamSpec, options.taskId)

          // Add sub-agent results to state
          for (const workerResult of teamResult.results) {
            state.addSubAgentResult(
              workerResult.role,
              workerResult.agentResponse || workerResult.role,
              workerResult.success
                ? `Changes: ${(workerResult.changedFiles || []).join(', ') || 'none'}`
                : `Failed: ${workerResult.error || 'Unknown error'}`,
            )
          }

          // Try to merge patches into the main sandbox
          const mainSandbox = getSandbox(options.taskId)
          if (mainSandbox && teamResult.mergedPatch) {
            const mergeResult = await mergeWorkerPatches(mainSandbox, teamResult)

            if (!mergeResult.success) {
              await logger.error('Worker merge had conflicts')
            }
          }

          // Build summary
          const summaryParts = [
            `🧠 **Worker Team Results** (${teamResult.totalDurationMs}ms total)`,
            `✅ ${teamResult.successCount} succeeded, ❌ ${teamResult.failCount} failed`,
            '',
          ]

          for (const r of teamResult.results) {
            const status = r.success ? '✅' : '❌'
            const fileCount = r.changedFiles?.length || 0
            const duration = `${(r.durationMs / 1000).toFixed(1)}s`
            summaryParts.push(`${status} **${r.role}** (${r.agentType}, ${duration}) — ${fileCount} file(s) changed`)
            if (r.changedFiles && r.changedFiles.length > 0) {
              for (const file of r.changedFiles.slice(0, 10)) {
                summaryParts.push(`  \`${file}\``)
              }
              if (r.changedFiles.length > 10) {
                summaryParts.push(`  … and ${r.changedFiles.length - 10} more`)
              }
            }
            if (!r.success && r.error) {
              summaryParts.push(`  Error: ${r.error}`)
            }
          }

          const summary = summaryParts.join('\n')
          state.appendContext(summary)

          return summary
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Worker team deployment failed'
          await logger.error('Worker team deployment failed')
          state.appendContext(`Worker team deployment failed: ${errorMsg}`)
          return `❌ Worker team deployment failed: ${errorMsg}`
        }
      },
    }),
  }
}
