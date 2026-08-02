import { Sandbox } from '@vercel/sandbox'
import { runWorkerAgent } from '@/lib/sandbox/agents/worker'
import { PROJECT_DIR, runCommandInSandbox, runInProject } from '@/lib/sandbox/commands'
import type { WorkerResult, WorkerSpec, WorkerTeamResult, WorkerTeamSpec } from './types'

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

      // 4. Run the agent inside this sandbox — delegates ALL agent-specific
      //    install / env / config knowledge to the shared adapter (ADR-0002).
      const agentResult = await runWorkerAgent(sandbox, {
        id: worker.id,
        agentType: worker.agentType,
        model: worker.model,
        instructions: worker.instructions,
        apiKeys: spec.apiKeys,
      })

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

// ─── Utilities ───────────────────────────────────────────────────────────

function extractChangedFiles(gitPatch: string): string[] {
  const files = new Set<string>()
  const regex = /^diff --git a\/(.+?) b\//gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(gitPatch)) !== null) {
    if (match[1]) files.add(match[1])
  }
  return [...files].sort()
}
