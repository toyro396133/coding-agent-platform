/**
 * lib/ai/orchestrator/prompt-assembler.ts — PromptAssembler.
 *
 * Per the architecture review (candidate 3), the system prompt of the
 * orchestrator is assembled from SIX independent sources:
 *   1. base system prompt (+ routing context)
 *   2. mode instructions (capability level)
 *   3. project rules
 *   4. task queue awareness
 *   5. autonomy instructions
 *   6. repository map (compressed AST hierarchy)
 *
 * Extracting this into a deep, testable module gives locality (a change in
 * autonomy wording touches only this file) and makes the prompt assembly
 * testable via snapshot tests without a live model.
 */

import type { RoutingResult } from '@/lib/ai/router'
import type { AutonomyLevel, CapabilityLevel } from './capabilities/types'

// ─── Mode instructions ──────────────────────────────────────────────────

/**
 * Capability-level instructions: what tools/modes the agent is running with.
 */
export function buildModeInstructions(level: CapabilityLevel): string {
  if (level === 'enhanced') {
    return `
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
  }
  if (level === 'auto') {
    return `
You are in AUTO mode. You start with basic tools and can escalate as needed.
Use session and background tools for coordination.
When you detect the task is complex, request enhanced capabilities.`
  }
  return ''
}

// ─── Autonomy instructions ──────────────────────────────────────────────

/**
 * Autonomy-level instructions: how much control the agent has and whether it
 * pauses for approval. Applied AFTER mode instructions so it takes precedence.
 */
export function buildAutonomyInstructions(autonomyLevel: AutonomyLevel): string {
  if (autonomyLevel === 'full') {
    return `

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
  }
  if (autonomyLevel === 'autonomous') {
    return `

=== AUTONOMOUS MODE ===
You execute freely and do not need step-by-step approval. Plan approval is
optional — if you create a plan you may continue working in the same pass.`
  }
  return `

=== GUIDED MODE ===
You may create a plan for human approval. When you call createPlan, the task
will pause and wait for the user to approve before continuing.`
}

// ─── Base system prompt ─────────────────────────────────────────────────

/**
 * The base orchestrator prompt enriched with routing context (category,
 * complexity, tech stack) and the autonomous full-stack workflow when the
 * task is complex enough to warrant it.
 */
export function buildBaseSystemPrompt(routingResult: RoutingResult, customSystemPrompt?: string): string {
  const base =
    customSystemPrompt ||
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
`

  if (routingResult.category === 'complex_code' && routingResult.complexity >= 5) {
    return (
      base +
      `

=== AUTONOMOUS FULL-STACK MODE ===
You have FULL AUTONOMY to:
1. Analyze the codebase with generateRepoMap
2. Plan your implementation
3. Write/Edit files using the file tools
4. Run builds and tests with bash
5. Deploy and verify with browser tools

Proceed without asking for each step. Use your judgment.`
    )
  }

  return base
}

// ─── Assembly ───────────────────────────────────────────────────────────

export interface PromptAssemblyInput {
  baseSystemPrompt: string
  modeInstructions: string
  rulesText: string
  taskQueueAwareness: string
  autonomyInstructions: string
  repoMapContext: string
}

/**
 * Concatenate all six prompt sources in a fixed order. Pure function —
 * trivially snapshot-testable without any live model or database.
 */
export function assembleSystemPrompt(input: PromptAssemblyInput): string {
  return (
    input.baseSystemPrompt +
    input.modeInstructions +
    input.rulesText +
    input.taskQueueAwareness +
    input.autonomyInstructions +
    input.repoMapContext
  )
}
