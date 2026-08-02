import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { getProjectRules } from './rules'
import { tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getModelClient } from '@/lib/ai/models'
import { routePrompt } from '@/lib/ai/router'
import { OrchestratorState, type OrchestratorResult, type AgentTeamMember } from './state'
import { createOrchestratorTools } from './tools'
import { loadCapabilityTools } from './capabilities/index'
import { loadPackTools } from './runtime/plugin-registry'
import { getModeConfig } from './modes'
import type { AutonomyLevel, CapabilityLevel } from './capabilities/types'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { deployWorkerTeam, mergeWorkerPatches } from './worker/worker-manager'
import type { WorkerSpec, WorkerTeamSpec } from './worker/types'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { SandboxBridge } from './runtime/sandbox-bridge'
import { buildRepoMap } from './capabilities/repo-map'
import { createTaskQueueTools, buildTaskQueueAwareness } from './task-queue'

interface RunOrchestratorOptions {
  taskId: string
  userId?: string
  repoUrl?: string
  selectedModel?: string
  systemPrompt?: string
  maxSteps?: number
  capabilityLevel?: CapabilityLevel
  /**
   * Autonomy level for this run. Defaults to 'full' (100% control): the agent
   * never pauses for plan approval and receives system-control tools.
   */
  autonomyLevel?: AutonomyLevel
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
}

/**
 * Intelligent Agent Team composition based on task analysis.
 * Like Claude Code's Agent Teams - spawns specialized workers in parallel.
 */
export function composeAgentTeam(prompt: string, _repoUrl?: string): AgentTeamMember[] {
  const team: AgentTeamMember[] = []
  const lower = prompt.toLowerCase()

  // Always include a lead engineer
  team.push({
    role: 'Lead Engineer',
    specialty: 'implementation',
    model: 'claude-sonnet-4-5',
  })

  // Frontend specialist
  if (
    lower.includes('ui') ||
    lower.includes('component') ||
    lower.includes('frontend') ||
    lower.includes('front end') ||
    lower.includes('css') ||
    lower.includes('styling') ||
    lower.includes('react') ||
    lower.includes('vue') ||
    lower.includes('angular') ||
    lower.includes('design') ||
    lower.includes('page') ||
    lower.includes('layout')
  ) {
    team.push({
      role: 'Frontend Specialist',
      specialty: 'ui_implementation',
      model: 'gemini-2.5-flash',
    })
  }

  // Backend/database specialist
  if (
    lower.includes('api') ||
    lower.includes('backend') ||
    lower.includes('database') ||
    lower.includes('server') ||
    lower.includes('schema') ||
    lower.includes('migration') ||
    lower.includes('auth') ||
    lower.includes('route') ||
    lower.includes('endpoint') ||
    lower.includes('graphql') ||
    lower.includes('rest') ||
    lower.includes('middleware')
  ) {
    team.push({
      role: 'Backend Specialist',
      specialty: 'api_implementation',
      model: 'claude-sonnet-4-5',
    })
  }

  // Testing specialist
  if (
    lower.includes('test') ||
    lower.includes('testing') ||
    lower.includes('coverage') ||
    lower.includes('assert') ||
    lower.includes('jest') ||
    lower.includes('vitest') ||
    lower.includes('cypress') ||
    lower.includes('playwright')
  ) {
    team.push({
      role: 'QA Engineer',
      specialty: 'test_writing',
      model: 'gpt-4o-mini',
    })
  }

  // DevOps specialist
  if (
    lower.includes('deploy') ||
    lower.includes('ci') ||
    lower.includes('cd') ||
    lower.includes('docker') ||
    lower.includes('pipeline') ||
    lower.includes('infrastructure') ||
    lower.includes('config') ||
    lower.includes('environment')
  ) {
    team.push({
      role: 'DevOps Engineer',
      specialty: 'infrastructure',
      model: 'gpt-4o-mini',
    })
  }

  return team
}

export async function runOrchestrator(prompt: string, options: RunOrchestratorOptions): Promise<OrchestratorResult> {
  const state = new OrchestratorState(options.taskId, prompt, options.maxSteps || 30)
  const logger = createTaskLogger(options.taskId)

  // Set userId on state for task queue tools
  if (options.userId) {
    state.userId = options.userId
  }

  const level = options.capabilityLevel || 'enhanced'
  state.capabilityLevel = level
  const autonomyLevel = options.autonomyLevel || 'full'
  state.autonomyLevel = autonomyLevel
  // Build the tool context whenever we have a userId — even in basic mode — so
  // full autonomy can always load the system-control pack regardless of the
  // capability level.
  if (options.userId) {
    state.setCapabilityContext(level, options.userId, autonomyLevel)
  }

  // Smart model selection using the enhanced router
  const routingResult = routePrompt(prompt)
  const modelName = options.selectedModel || routingResult.model
  const model = getModelClient(modelName)

  const config = getModeConfig(level)
  let modeInstructions = ''

  // Level-specific instructions
  if (level === 'enhanced') {
    modeInstructions = `
You are in ENHANCED mode with these capabilities:
📡 Web Search & Fetch — research, docs, API references
📋 Planning & Approval — create structured plans for user approval
💾 Session Management — checkpoints, history, forks
🔧 Background Tasks — run tasks in the background
🔬 Research Tools — codebase analysis, dependency audit
📁 File Tools — read, write, edit, glob, grep
💻 Shell Tools — execute commands, run builds, run tests
🔍 LSP/AST Tools — type checking, code analysis
🌐 Browser Tools — Playwright navigation, screenshots
🗺️ Repo Map — codebase structure overview
🛠️ System Tools — platform control (sandboxes, API keys, settings, rate limits, tasks)

Use the right tools for each job. Start with generateRepoMap to understand the codebase.`
  } else if (level === 'auto') {
    modeInstructions = `
You are in AUTO mode. You start with basic tools and can escalate as needed.
Use session and background tools for coordination.
When you detect the task is complex, request enhanced capabilities.`
  }

  const rulesText = await getProjectRules(options.userId || '', options.repoUrl || '')

  // Build the system prompt with routing context
  const baseSystemPrompt =
    options.systemPrompt ||
    `You are the Orchestrator Agent. Analyze the task and execute it autonomously.

YOUR WORKFLOW:
1. First, use generateRepoMap to understand the codebase structure
2. For complex tasks (complexity > 5), create a plan using createPlan
3. For multi-file changes, use spawnSubAgents to parallelize work
4. Execute file operations using the file tools
5. Verify using bash for type checks and tests
6. Call finalize when done

${routingResult.complexity >= 7 ? '⚠️ HIGH COMPLEXITY TASK — plan carefully, verify thoroughly' : ''}
${routingResult.techStack.length > 0 && !routingResult.techStack.includes('unknown') ? `Detected tech stack: ${routingResult.techStack.join(', ')}` : ''}
Task complexity: ${routingResult.complexity}/10
Category: ${routingResult.category}
` +
      (routingResult.category === 'complex_code' && routingResult.complexity >= 5
        ? `

=== AUTONOMOUS FULL-STACK MODE ===
You have FULL AUTONOMY to:
1. Analyze the codebase with generateRepoMap
2. Plan your implementation
3. Write/Edit files using the file tools
4. Run builds and tests with bash
5. Deploy and verify with browser tools

Proceed without asking for each step. Use your judgment.`
        : '')

  // Build task queue awareness section (shows queued tasks + tools)
  let taskQueueAwareness = ''
  if (options.userId) {
    try {
      taskQueueAwareness = await buildTaskQueueAwareness(options.userId)
    } catch {
      // Best-effort
    }
  }

  // Aider-style repo map injected into the system prompt (best-effort): the
  // compressed AST hierarchy gives the agent the codebase overview up front so
  // it does not need to burn tokens reading every file or calling the repo-map
  // tool on the first turn.
  let repoMapContext = ''
  if (getSandbox(options.taskId)) {
    try {
      const mapResult = await buildRepoMap(new SandboxBridge(options.taskId), {
        maxFiles: 60,
        maxTokens: 1024,
        maxSymbolsPerFile: 10,
      })
      if (mapResult.text) {
        repoMapContext = `\n\n=== REPOSITORY MAP (compressed, ${mapResult.filesIncluded}/${mapResult.totalFiles} files, ${mapResult.truncated ? 'truncated to token budget' : 'complete'}) ===\n${mapResult.text}`
      }
    } catch {
      // Best-effort — repo map is an enhancement, never a blocker
    }
  }

  // Full-autonomy mandate: the agent controls the platform itself and never
  // pauses for approval. Applied after mode instructions so it takes precedence.
  let autonomyInstructions = ''
  if (autonomyLevel === 'full') {
    autonomyInstructions = `

=== FULL AUTONOMY & SYSTEM CONTROL ===
You have 100% autonomy over both the task AND the platform itself.
- Do NOT ask for permission or wait for approval at any step.
- Use the system tools (getSystemStatus, listActiveTasks, stopTask, killSandbox,
  getRateLimitStatus, getRouterMetrics, listPlatformApiKeys, revokePlatformApiKey,
  getUserSettings, setUserSetting) to observe and control the platform.
- You may stop runaway tasks, revoke leaked API keys, adjust settings, and
  kill sandboxes — exercise judgment, act decisively.
- The createPlan tool records a plan but NEVER pauses execution; proceed and execute.
- Handle errors autonomously: diagnose, fix, retry. Only surface the final result.`
  } else if (autonomyLevel === 'autonomous') {
    autonomyInstructions = `

=== AUTONOMOUS MODE ===
You execute freely and do not need step-by-step approval. Plan approval is
optional — if you create a plan you may continue working in the same pass.`
  } else {
    autonomyInstructions = `

=== GUIDED MODE ===
You may create a plan for human approval. When you call createPlan, the task
will pause and wait for the user to approve before continuing.`
  }

  const systemPrompt =
    baseSystemPrompt + modeInstructions + rulesText + taskQueueAwareness + autonomyInstructions + repoMapContext

  // Compose Agent Team for parallel execution
  const agentTeam = composeAgentTeam(prompt, options.repoUrl)
  if (agentTeam.length > 1) {
    state.agentTeam = agentTeam
  }

  // ─── Agent Teams tool — deploys real sandbox-backed workers ─────
  const agentTeamsTool = {
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
          agentType: (w.agentType || 'claude') as any,
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

  while (state.steps < state.maxSteps && !state.completed) {
    // Check if task was externally cancelled or paused
    const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, options.taskId))
    if (!currentTask) {
      state.appendContext('Task no longer exists — stopping.')
      break
    }
    if (currentTask.status === 'PLANNING_PENDING_APPROVAL') {
      state.completed = true
      state.paused = true
      state.appendContext('Task paused waiting for user approval of the plan.')
      break
    }
    if (currentTask.status === 'stopped' || currentTask.status === 'error') {
      state.completed = true
      state.appendContext(`Task was externally ${currentTask.status} — stopping.`)
      break
    }

    const legacyTools = createOrchestratorTools(state)
    let allTools = { ...legacyTools }

    // Add Agent Teams tool if we have a multi-member team
    if (agentTeam.length > 1) {
      allTools = { ...allTools, ...agentTeamsTool }
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

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: state.currentPrompt,
        tools: allTools,
        stopWhen: stepCountIs(3),
      })

      if (text) {
        state.appendContext(text)
      }
    } catch (error) {
      console.error('Orchestrator generation error')
      state.appendContext('Error during generation')
    }

    state.steps++

    if (state.completed) {
      break
    }

    if (state.shouldCheckpoint()) {
      state.saveCheckpoint()
    }
  }

  return state.getResult()
}
