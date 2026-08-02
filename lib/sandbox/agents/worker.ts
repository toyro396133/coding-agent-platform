/**
 * lib/sandbox/agents/worker.ts — Worker agent runner (the single adapter).
 *
 * Per ADR-0002, ALL knowledge of "how to run an agent CLI (claude / codex /
 * cursor / gemini / …) inside a Vercel sandbox" lives in this module.
 * `worker-manager.ts` only handles lifecycle (create sandbox, clone, git
 * config, diff extraction, patch merge) and delegates the actual agent run
 * here — it no longer duplicates install / env / config logic.
 */

import type { Sandbox } from '@vercel/sandbox'
import type { TaskLogger } from '@/lib/utils/task-logger'
import { PROJECT_DIR, runCommandInSandbox, runInProject } from '../commands'
import { installClaudeCLI } from './claude'
import { buildCodexConfigToml } from './codex'
import type { AgentApiKeys, AgentType } from './index'

// ─── Types ──────────────────────────────────────────────────────────────

export interface WorkerAgentInput {
  /** Unique worker id — used for safe temp filenames */
  id: string
  /** Agent CLI to run: claude, cursor, codex, gemini, copilot, opencode, … */
  agentType: string
  /** Optional model override for this worker */
  model?: string
  /** The instructions to hand to the agent CLI */
  instructions: string
  /** API keys to provision in the sandbox for this run */
  apiKeys?: AgentApiKeys
}

export interface WorkerAgentResult {
  success: boolean
  error?: string
  response?: string
}

// ─── Entry point ────────────────────────────────────────────────────────

/**
 * Run a single worker agent inside its dedicated sandbox.
 * This is the ONLY place that knows how to invoke each agent CLI.
 */
export async function runWorkerAgent(sandbox: Sandbox, worker: WorkerAgentInput): Promise<WorkerAgentResult> {
  switch (worker.agentType) {
    case 'claude':
      return runClaudeWorker(sandbox, worker)
    case 'cursor':
      return runCursorWorker(sandbox, worker)
    case 'codex':
      return runCodexWorker(sandbox, worker)
    case 'gemini':
      return runGeminiWorker(sandbox, worker)
    default:
      return runGenericWorker(sandbox, worker)
  }
}

// ─── Claude ─────────────────────────────────────────────────────────────

async function runClaudeWorker(sandbox: Sandbox, worker: WorkerAgentInput): Promise<WorkerAgentResult> {
  // Step 1 — fail fast if no API key is configured (avoid an expensive install)
  const apiKey = worker.apiKeys?.AI_GATEWAY_API_KEY || worker.apiKeys?.ANTHROPIC_API_KEY || ''
  if (!apiKey) {
    return { success: false, error: 'Claude worker requires AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY' }
  }

  const silentLogger = createSilentLogger()

  // Step 2 — install the CLI into this sandbox (idempotent)
  const installResult = await installClaudeCLI(sandbox, silentLogger, worker.model, [])
  if (!installResult.success) {
    return { success: false, error: 'Failed to install Claude CLI in worker' }
  }

  const baseUrl = 'https://ai-gateway.vercel.sh'
  const model = worker.model || 'claude-sonnet-4-5'

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker.id, worker.instructions)

  // Use file-based instruction passing — cat output in $() is safe
  // because the result is not re-interpreted within double quotes
  const fullCommand = [
    `cd "${PROJECT_DIR}"`,
    `ANTHROPIC_API_KEY="${apiKey}"`,
    `ANTHROPIC_BASE_URL="${baseUrl}"`,
    `claude --model "${model}"`,
    '--dangerously-skip-permissions',
    `"$(cat '${instructionsFile}')"`,
  ].join(' ')

  const result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

  return {
    success: result.success,
    error: result.error,
    response: result.output,
  }
}

// ─── Cursor ─────────────────────────────────────────────────────────────

async function runCursorWorker(sandbox: Sandbox, worker: WorkerAgentInput): Promise<WorkerAgentResult> {
  const apiKey = worker.apiKeys?.CURSOR_API_KEY || ''
  if (!apiKey) {
    return { success: false, error: 'Cursor worker requires CURSOR_API_KEY' }
  }

  // Check if cursor-agent is already available
  const whichResult = await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    'export PATH="$HOME/.local/bin:$PATH"; which cursor-agent 2>/dev/null || echo "NOT_FOUND"',
  ])

  if (whichResult.output?.includes('NOT_FOUND')) {
    return { success: false, error: 'cursor-agent not found in worker sandbox' }
  }

  const modelFlag = worker.model ? `--model ${worker.model}` : ''

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker.id, worker.instructions)

  // Use absolute path for reliability; CURSOR_API_KEY must be on the SAME command as cursor-agent
  const fullCommand = [
    `cd "${PROJECT_DIR}"`,
    '&&',
    `CURSOR_API_KEY="${apiKey}"`,
    '/home/vercel-sandbox/.local/bin/cursor-agent -p --force',
    modelFlag,
    `"$(cat '${instructionsFile}')"`,
  ]
    .filter(Boolean)
    .join(' ')

  const result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

  return {
    success: result.success,
    error: result.error,
    response: result.output,
  }
}

// ─── Codex ──────────────────────────────────────────────────────────────

async function runCodexWorker(sandbox: Sandbox, worker: WorkerAgentInput): Promise<WorkerAgentResult> {
  const apiKey = worker.apiKeys?.AI_GATEWAY_API_KEY || worker.apiKeys?.OPENAI_API_KEY || ''
  if (!apiKey) {
    return { success: false, error: 'Codex worker requires AI_GATEWAY_API_KEY or OPENAI_API_KEY' }
  }

  // Install codex if needed
  const whichResult = await runCommandInSandbox(sandbox, 'which', ['codex'])
  if (!whichResult.success) {
    const installResult = await runInProject(sandbox, 'npm', ['install', '-g', '@openai/codex'])
    if (!installResult.success) {
      return { success: false, error: 'Failed to install Codex CLI in worker' }
    }
  }

  const model = worker.model || 'openai/gpt-4o'

  // Shared config.toml builder — the same one used by the main codex path.
  const configToml = buildCodexConfigToml(model, apiKey)

  // Write config.toml to ~/.codex/
  const writeConfigCmd = `mkdir -p ~/.codex && cat > ~/.codex/config.toml << 'CODEX_EOF'
${configToml}CODEX_EOF`
  await runCommandInSandbox(sandbox, 'sh', ['-c', writeConfigCmd])

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker.id, worker.instructions)

  const fullCommand = [
    `cd "${PROJECT_DIR}"`,
    `AI_GATEWAY_API_KEY="${apiKey}"`,
    `HOME="/home/vercel-sandbox"`,
    'codex exec --dangerously-bypass-approvals-and-sandbox',
    `"$(cat '${instructionsFile}')"`,
  ].join(' ')

  const result = await runCommandInSandbox(sandbox, 'sh', ['-c', fullCommand])

  return {
    success: result.success,
    error: result.error,
    response: result.output,
  }
}

// ─── Gemini ─────────────────────────────────────────────────────────────

async function runGeminiWorker(sandbox: Sandbox, worker: WorkerAgentInput): Promise<WorkerAgentResult> {
  const apiKey = worker.apiKeys?.GEMINI_API_KEY || ''
  if (!apiKey) {
    return { success: false, error: 'Gemini worker requires GEMINI_API_KEY' }
  }

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker.id, worker.instructions)

  // Use npx @google/gemini-cli instead of global install — avoids PATH issues
  // and ensures the latest version is always used

  // 3-tier fallback matching original gemini.ts:
  // 1) Try with --yolo (auto-approve all tools)
  // 2) Failover to --approval-mode auto_edit with text output
  // 3) Minimal flags as last resort
  const tryCommands = [
    // Tier 1: yolo mode
    [
      `cd "${PROJECT_DIR}"`,
      `GEMINI_API_KEY="${apiKey}"`,
      'npx --yes @google/gemini-cli --yolo',
      `"$(cat '${instructionsFile}')"`,
    ].join(' '),
    // Tier 2: approval-mode auto_edit with text output
    [
      `cd "${PROJECT_DIR}"`,
      `GEMINI_API_KEY="${apiKey}"`,
      'npx --yes @google/gemini-cli --approval-mode auto_edit -o text',
      `"$(cat '${instructionsFile}')"`,
    ].join(' '),
    // Tier 3: minimal flags (just model if specified)
    [
      `cd "${PROJECT_DIR}"`,
      `GEMINI_API_KEY="${apiKey}"`,
      worker.model ? `npx --yes @google/gemini-cli -m ${worker.model}` : 'npx --yes @google/gemini-cli',
      `"$(cat '${instructionsFile}')"`,
    ].join(' '),
  ]

  let lastResult: { success: boolean; error?: string; output?: string } | null = null
  for (const cmd of tryCommands) {
    const result = await runCommandInSandbox(sandbox, 'sh', ['-c', cmd])
    lastResult = result

    // Success — return immediately
    if (result.success) {
      return {
        success: true,
        error: undefined,
        response: result.output,
      }
    }

    // Tool registry errors are common in sandboxes — try next tier
    if (result.error?.includes('Tool') && result.error?.includes('not found in registry')) {
    }

    // Other errors are terminal for the worker (auth failure, etc.)
    // But still try the next tier as a best-effort
  }

  // All tiers failed — return the last error
  return {
    success: false,
    error: lastResult?.error || 'Gemini worker failed after all fallbacks',
    response: lastResult?.output,
  }
}

// ─── Generic fallback ───────────────────────────────────────────────────

async function runGenericWorker(sandbox: Sandbox, worker: WorkerAgentInput): Promise<WorkerAgentResult> {
  // Fallback: use the full executeAgentInSandbox flow
  const { executeAgentInSandbox } = await import('./index')
  const silentLogger = createSilentLogger()

  const result = await executeAgentInSandbox(
    sandbox,
    worker.instructions,
    worker.agentType as AgentType,
    silentLogger,
    worker.model,
    [], // No MCP servers for workers
    undefined,
    worker.apiKeys,
    false,
    undefined,
    worker.id,
  )

  return {
    success: result.success,
    error: result.error,
    response: result.agentResponse,
  }
}

// ─── Safe instruction passing via temp files ────────────────────────────

/**
 * Write worker instructions to a temp file using base64 encoding,
 * completely avoiding shell escaping issues.
 */
async function writeInstructionsFile(sandbox: Sandbox, workerId: string, instructions: string): Promise<string> {
  // Sanitize worker ID for use as a filename
  const safeId = workerId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = `/tmp/worker-instructions-${safeId}.txt`

  // Base64 is safe in single quotes (no ' char in its alphabet)
  const b64 = Buffer.from(instructions, 'utf-8').toString('base64')
  const writeCmd = `printf '%s' '${b64}' | base64 -d > '${filePath}'`
  await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])

  return filePath
}

// ─── Utilities ──────────────────────────────────────────────────────────

/**
 * No-op logger used for worker runs (they don't persist logs to a task row).
 * Cast through `unknown` because TaskLogger carries a private `taskId` field
 * that a structural object literal can never satisfy.
 */
function createSilentLogger(): TaskLogger {
  return {
    append: async () => {},
    info: async () => {},
    command: async () => {},
    error: async () => {},
    success: async () => {},
    updateProgress: async () => {},
    updateStatus: async () => {},
  } as unknown as TaskLogger
}
