import { generateText, stepCountIs } from 'ai'
import { eq } from 'drizzle-orm'
import { getModelClient } from '@/lib/ai/models'
import { routePrompt } from '@/lib/ai/router'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { buildRepoMap } from './capabilities/repo-map'
import {
  assembleSystemPrompt,
  buildAutonomyInstructions,
  buildBaseSystemPrompt,
  buildModeInstructions,
} from './prompt-assembler'
import { getProjectRules } from './rules'
import { SandboxBridge } from './runtime/sandbox-bridge'
import { type AgentTeamMember, type OrchestratorResult, OrchestratorState } from './state'
import { buildTaskQueueAwareness } from './task-queue'
import { assembleOrchestratorTools, type RunOrchestratorOptions } from './tool-assembler'

export type { RunOrchestratorOptions } from './tool-assembler'

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

/**
 * LoopRunner — orchestrates a single task to completion.
 *
 * Responsibilities here are deliberately narrow:
 *   - initialize state + routing
 *   - assemble the system prompt (delegated to PromptAssembler)
 *   - assemble the tool registry per step (delegated to ToolAssembler)
 *   - run the step loop with cancellation + checkpointing
 */
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

  // ─── Prompt assembly (PromptAssembler) ─────────────────────────────
  const modeInstructions = buildModeInstructions(level)
  const rulesText = await getProjectRules(options.userId || '', options.repoUrl || '')
  const baseSystemPrompt = buildBaseSystemPrompt(routingResult, options.systemPrompt)

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

  const autonomyInstructions = buildAutonomyInstructions(autonomyLevel)
  const systemPrompt = assembleSystemPrompt({
    baseSystemPrompt,
    modeInstructions,
    rulesText,
    taskQueueAwareness,
    autonomyInstructions,
    repoMapContext,
  })

  // Compose Agent Team for parallel execution
  const agentTeam = composeAgentTeam(prompt, options.repoUrl)
  if (agentTeam.length > 1) {
    state.agentTeam = agentTeam
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

    // ─── Tool assembly (ToolAssembler) ───────────────────────────────
    const allTools = assembleOrchestratorTools({ state, options, logger, agentTeam })

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
