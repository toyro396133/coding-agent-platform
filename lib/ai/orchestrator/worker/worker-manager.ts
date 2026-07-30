import { Sandbox } from '@vercel/sandbox'
import { runInProject, runCommandInSandbox, PROJECT_DIR } from '@/lib/sandbox/commands'
import type { WorkerSpec, WorkerTeamSpec, WorkerResult, WorkerTeamResult } from './types'

/**
 * Run a list of promises with an overall timeout.
 * Rejects if the timeout is reached before all promises settle.
 */
async function promiseWithTimeout<T>(promises: Promise<T>[], timeoutMs: number): Promise<T[]> {
  if (timeoutMs <= 0) {
    return Promise.all(promises)
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Worker team deployment timed out'))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([Promise.all(promises), timeoutPromise])
    return result
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Deploy a team of worker agents, each in its own Vercel sandbox,
 * running their assigned agent CLI in parallel.
 *
 * After all workers finish, the manager:
 *  1. Extracts a git diff (patch) from each worker sandbox
 *  2. Cleans up each worker sandbox
 *  3. Returns the aggregated result
 */
export async function deployWorkerTeam(spec: WorkerTeamSpec, _taskId: string): Promise<WorkerTeamResult> {
  const startTime = Date.now()
  const overallTimeout = spec.timeoutMs ?? 30 * 60 * 1000 // default 30 min

  // Spawn ALL workers in parallel — each gets its own sandbox
  const workerPromises = spec.workers.map(async (worker) => deploySingleWorker(worker, spec))

  const results = await promiseWithTimeout(workerPromises, overallTimeout)

  const successCount = results.filter((r) => r.success).length
  const failCount = results.filter((r) => !r.success).length

  // Combine all successful patches
  const allPatches = results
    .filter((r) => r.success && r.gitPatch)
    .map((r) => r.gitPatch!)
    .filter(Boolean)

  return {
    results,
    mergedPatch: allPatches.length > 0 ? allPatches.join('\n') : undefined,
    totalDurationMs: Date.now() - startTime,
    successCount,
    failCount,
  }
}

/**
 * Apply all worker patches into the main sandbox via `git apply --3way`.
 * Reports any merge conflicts so the orchestrator can handle them.
 */
export async function mergeWorkerPatches(
  mainSandbox: Sandbox,
  teamResult: WorkerTeamResult,
): Promise<{ success: boolean; conflicts: { file: string; error: string }[] }> {
  const conflicts: { file: string; error: string }[] = []

  if (!teamResult.mergedPatch) {
    return { success: true, conflicts: [] }
  }

  // Write the combined patch into the main sandbox as a temp file
  const patchB64 = Buffer.from(teamResult.mergedPatch).toString('base64')
  const writePatch = `printf '%s' '${patchB64}' | base64 -d > /tmp/worker-merge.patch`
  await runInProject(mainSandbox, 'sh', ['-c', writePatch])

  // First attempt: 3-way merge (best for non-conflicting parallel changes)
  const applyResult = await runInProject(mainSandbox, 'git', ['apply', '--3way', '/tmp/worker-merge.patch'])

  if (!applyResult.success) {
    // Second attempt: with --reject to apply non-conflicting portions
    const rejectResult = await runInProject(mainSandbox, 'git', ['apply', '--reject', '/tmp/worker-merge.patch'])

    if (!rejectResult.success) {
      conflicts.push({
        file: 'merge',
        error: rejectResult.error || 'Patch application failed',
      })
    } else {
      // Check for .rej files indicating partial conflicts
      const rejFiles = await runInProject(mainSandbox, 'find', [PROJECT_DIR, '-name', '*.rej', '-type', 'f'])
      if (rejFiles.output?.trim()) {
        const rejectedPaths = rejFiles.output
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((p: string) => p.replace(`${PROJECT_DIR}/`, ''))
        for (const file of rejectedPaths) {
          conflicts.push({ file: file.replace(/\.rej$/, ''), error: 'Rejected hunk — manual merge needed' })
        }
      }
    }
  }

  // Clean up patch file (keep .rej files for manual resolution)
  await runInProject(mainSandbox, 'rm', ['-f', '/tmp/worker-merge.patch'])

  return {
    success: conflicts.length === 0,
    conflicts,
  }
}

// ─── Single worker lifecycle ─────────────────────────────────────────────

async function deploySingleWorker(worker: WorkerSpec, spec: WorkerTeamSpec): Promise<WorkerResult> {
  const workerStart = Date.now()

  try {
    // 1. Create a dedicated Vercel sandbox for this worker
    const sandbox = await Sandbox.create({
      timeout: 15 * 60 * 1000, // 15 min hard limit per worker
      ports: [],
      runtime: 'node22',
      resources: { vcpus: 2 },
    })

    try {
      // 2. Prepare project directory and clone the repo
      await runCommandInSandbox(sandbox, 'mkdir', ['-p', PROJECT_DIR])

      const authUrl = spec.githubToken?.trim()
        ? spec.repoUrl.replace('https://', `https://x-access-token:${spec.githubToken.trim()}@`)
        : spec.repoUrl

      const cloneResult = await runCommandInSandbox(sandbox, 'git', ['clone', '--depth', '1', authUrl, PROJECT_DIR])
      if (!cloneResult.success) {
        throw new Error(`Clone failed: ${cloneResult.error || 'Unknown error'}`)
      }

      // 3. Configure git identity
      const authorName = spec.gitAuthorName || 'Worker Agent'
      const authorEmail = spec.gitAuthorEmail || 'worker@agent.local'
      await runInProject(sandbox, 'git', ['config', 'user.name', authorName])
      await runInProject(sandbox, 'git', ['config', 'user.email', authorEmail])

      // Checkout the target branch (create if missing)
      const branchCheck = await runInProject(sandbox, 'git', ['rev-parse', '--verify', spec.branchName])
      if (branchCheck.success) {
        await runInProject(sandbox, 'git', ['checkout', spec.branchName])
      } else {
        await runInProject(sandbox, 'git', ['checkout', '-b', spec.branchName])
      }

      // 4. Run the agent inside this sandbox
      const agentResult = await runWorkerAgent(sandbox, worker, spec)

      // 5. Extract git diff (all changes since HEAD)
      const diffResult = await runInProject(sandbox, 'git', ['diff', 'HEAD'])
      const stagedResult = await runInProject(sandbox, 'git', ['diff', '--cached'])
      const rawDiff = (diffResult.output || '') + (stagedResult.output || '')
      const gitPatch = rawDiff.trim() ? rawDiff : undefined
      const changedFiles = gitPatch ? extractChangedFiles(gitPatch) : []

      return {
        id: worker.id,
        role: worker.role,
        agentType: worker.agentType,
        success: agentResult.success,
        error: agentResult.error,
        gitPatch,
        changedFiles,
        agentResponse: agentResult.response,
        durationMs: Date.now() - workerStart,
      }
    } finally {
      // Always clean up the worker sandbox
      sandbox.stop().catch(() => {})
    }
  } catch (error) {
    return {
      id: worker.id,
      role: worker.role,
      agentType: worker.agentType,
      success: false,
      error: error instanceof Error ? error.message : 'Worker sandbox failed',
      durationMs: Date.now() - workerStart,
    }
  }
}

// ─── Agent-type-specific runners ─────────────────────────────────────────

interface WorkerAgentResult {
  success: boolean
  error?: string
  response?: string
}

async function runWorkerAgent(sandbox: Sandbox, worker: WorkerSpec, spec: WorkerTeamSpec): Promise<WorkerAgentResult> {
  switch (worker.agentType) {
    case 'claude':
      return runClaudeWorker(sandbox, worker, spec)
    case 'cursor':
      return runCursorWorker(sandbox, worker, spec)
    case 'codex':
      return runCodexWorker(sandbox, worker, spec)
    case 'gemini':
      return runGeminiWorker(sandbox, worker, spec)
    default:
      return runGenericWorker(sandbox, worker, spec)
  }
}

async function runClaudeWorker(sandbox: Sandbox, worker: WorkerSpec, spec: WorkerTeamSpec): Promise<WorkerAgentResult> {
  const { installClaudeCLI } = await import('@/lib/sandbox/agents/claude')

  const silentLogger = createSilentLogger()

  // Step 1 — install the CLI into this sandbox (idempotent)
  const installResult = await installClaudeCLI(sandbox, silentLogger, worker.model, [])
  if (!installResult.success) {
    return { success: false, error: 'Failed to install Claude CLI in worker' }
  }

  // Step 2 — run the agent inside the sandbox with API keys via env vars
  const apiKey = spec.apiKeys?.AI_GATEWAY_API_KEY || spec.apiKeys?.ANTHROPIC_API_KEY || ''
  if (!apiKey) {
    return { success: false, error: 'Claude worker requires AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY' }
  }

  const baseUrl = 'https://ai-gateway.vercel.sh'
  const model = worker.model || 'claude-sonnet-4-5'

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker)

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

async function runCursorWorker(sandbox: Sandbox, worker: WorkerSpec, spec: WorkerTeamSpec): Promise<WorkerAgentResult> {
  const apiKey = spec.apiKeys?.CURSOR_API_KEY || ''
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
  const instructionsFile = await writeInstructionsFile(sandbox, worker)

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

async function runCodexWorker(sandbox: Sandbox, worker: WorkerSpec, spec: WorkerTeamSpec): Promise<WorkerAgentResult> {
  const apiKey = spec.apiKeys?.AI_GATEWAY_API_KEY || spec.apiKeys?.OPENAI_API_KEY || ''
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

  // Determine API key type and configure accordingly (mirrors codex.ts)
  const isVercelKey = apiKey.startsWith('vck_')
  // For Vercel AI Gateway keys, set base_url to the gateway; for OpenAI keys, use direct API

  // Create config.toml with model_provider + base_url (same as original codex.ts)
  let configToml: string
  if (isVercelKey) {
    configToml = `model = "${model}"
model_provider = "vercel-ai-gateway"

[model_providers.vercel-ai-gateway]
name = "Vercel AI Gateway"
base_url = "https://ai-gateway.vercel.sh/v1"
env_key = "AI_GATEWAY_API_KEY"
wire_api = "responses"

[debug]
log_requests = true
`
  } else {
    configToml = `model = "${model}"
model_provider = "openai"

[model_providers.openai]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
env_key = "AI_GATEWAY_API_KEY"
wire_api = "responses"

[debug]
log_requests = true
`
  }

  // Write config.toml to ~/.codex/
  const writeConfigCmd = `mkdir -p ~/.codex && cat > ~/.codex/config.toml << 'CODEX_EOF'
${configToml}CODEX_EOF`
  await runCommandInSandbox(sandbox, 'sh', ['-c', writeConfigCmd])

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker)

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

async function runGeminiWorker(sandbox: Sandbox, worker: WorkerSpec, spec: WorkerTeamSpec): Promise<WorkerAgentResult> {
  const apiKey = spec.apiKeys?.GEMINI_API_KEY || ''
  if (!apiKey) {
    return { success: false, error: 'Gemini worker requires GEMINI_API_KEY' }
  }

  // Write instructions to a temp file to avoid shell escaping issues
  const instructionsFile = await writeInstructionsFile(sandbox, worker)

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
      continue // try next fallback
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

async function runGenericWorker(
  sandbox: Sandbox,
  worker: WorkerSpec,
  spec: WorkerTeamSpec,
): Promise<WorkerAgentResult> {
  // Fallback: use the full executeAgentInSandbox flow
  const { executeAgentInSandbox } = await import('@/lib/sandbox/agents')
  const silentLogger = createSilentLogger()

  const result = await executeAgentInSandbox(
    sandbox,
    worker.instructions,
    worker.agentType,
    silentLogger,
    worker.model,
    [], // No MCP servers for workers
    undefined,
    spec.apiKeys,
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
async function writeInstructionsFile(sandbox: Sandbox, worker: WorkerSpec): Promise<string> {
  // Sanitize worker ID for use as a filename
  const safeId = worker.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const filePath = `/tmp/worker-instructions-${safeId}.txt`

  // Base64 is safe in single quotes (no ' char in its alphabet)
  const b64 = Buffer.from(worker.instructions, 'utf-8').toString('base64')
  const writeCmd = `printf '%s' '${b64}' | base64 -d > '${filePath}'`
  await runCommandInSandbox(sandbox, 'sh', ['-c', writeCmd])

  return filePath
}

// ─── Utilities ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSilentLogger(): any {
  return {
    info: async () => {},
    command: async () => {},
    error: async () => {},
    success: async () => {},
    updateProgress: async () => {},
    updateStatus: async () => {},
  }
}

function extractChangedFiles(gitPatch: string): string[] {
  const files = new Set<string>()
  const regex = /^diff --git a\/(.+?) b\//gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(gitPatch)) !== null) {
    if (match[1]) files.add(match[1])
  }
  return [...files].sort()
}
