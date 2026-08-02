import type { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject } from '@/lib/sandbox/commands'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'
import type { TaskLogger } from '@/lib/utils/task-logger'
import { saveVisualQaRun } from './visual-qa-store'
import { captureScreenshotInSandbox, critiqueScreenshot, extractVerdict } from './visual-qa-tools'

/**
 * Automatic Visual QA — runs at task completion when the task touched UI
 * code, so the user gets a screenshot + vision-model critique in the Visual QA
 * panel without the agent having to call the tool explicitly.
 *
 * Flow:
 *   1. Detect UI changes (frontend file extensions in the git diff)
 *   2. Ensure a dev server is reachable (start one if the sandbox doesn't have it)
 *   3. Screenshot the app (Playwright in the sandbox)
 *   4. Send to a vision model for critique
 *   5. Persist the run to the task's Visual QA history
 *
 * Best-effort by design: any failure logs a static message and never fails the
 * task itself.
 */

// File extensions that indicate a UI/frontend change
const UI_FILE_PATTERN = /\.(tsx|jsx|vue|svelte|astro|html|htm|css|scss|sass|less|svg)$/i

export interface AutoVisualQaOptions {
  sandbox: Sandbox
  taskId: string
  userId: string
  repoUrl: string
  prompt: string
  logger: TaskLogger
  githubToken?: string | null
}

const DEFAULT_PORT = 3000

/**
 * Detect whether the last commit touches UI files. Runs after the changes have
 * already been committed and pushed, so the working tree is clean — we must
 * inspect the last commit itself (git show works for any commit, including the
 * very first one on a branch).
 */
async function hasUiChanges(sandbox: Sandbox): Promise<boolean> {
  // Files changed in the last commit (works for single-commit branches too)
  const show = await runInProject(sandbox, 'git', ['show', '--name-only', '--format=', 'HEAD'])
  const files = (show.output || '').trim().split('\n').filter(Boolean)

  if (files.length === 0) {
    return false
  }

  return files.some((file) => UI_FILE_PATTERN.test(file))
}

/**
 * Ensure a dev server is reachable at the target port. If nothing responds,
 * start `npm run dev` in the background and wait briefly for it to come up.
 * Returns the URL that was reachable, or null if no server could be brought up.
 */
async function ensureDevServer(sandbox: Sandbox, port: number, logger: TaskLogger): Promise<string | null> {
  const url = `http://localhost:${port}`

  const isUp = async () => {
    const probe = await runInProject(sandbox, 'sh', [
      '-c',
      `curl -s -o /dev/null -w "%{http_code}" --max-time 3 ${url} || true`,
    ])
    const code = (probe.output || '').trim()
    return code.startsWith('2') || code.startsWith('3')
  }

  if (await isUp()) {
    return url
  }

  await logger.info('Dev server not running - starting it for automatic visual QA')

  // Start the dev server in the background (matching the sandbox pipeline's approach)
  await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `cd /vercel/sandbox/project && nohup npm run dev -- --host 0.0.0.0 --port ${port} > /tmp/vqa-dev.log 2>&1 &`,
  ])

  // Poll briefly for the server to come up (max ~20s)
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (await isUp()) {
      return url
    }
  }

  return null
}

/**
 * Run automatic visual QA for a completed task. Detects UI changes, captures a
 * screenshot, gets a vision-model critique, and persists the run to the task's
 * Visual QA history. Never throws — failures are logged with static messages.
 */
export async function runAutomaticVisualQa(options: AutoVisualQaOptions): Promise<void> {
  const { sandbox, taskId, userId, repoUrl, prompt, logger, githubToken } = options

  try {
    const uiChanged = await hasUiChanges(sandbox)
    if (!uiChanged) {
      await logger.info('No UI changes detected - skipping automatic visual QA')
      return
    }

    await logger.info('UI changes detected - running automatic visual QA')

    // Determine the port (Vite projects default to 5173, others 3000)
    let port = DEFAULT_PORT
    try {
      port = await detectPortFromRepo(repoUrl, githubToken)
    } catch {
      // Keep default port
    }

    const url = await ensureDevServer(sandbox, port, logger)
    if (!url) {
      await logger.info('Automatic visual QA skipped - dev server not reachable')
      return
    }

    // Playwright may need to be installed on first use; cap the whole capture
    // so a slow/hanging install can never block task completion indefinitely.
    // The .catch() swallows late rejections from the sandbox network I/O after
    // the timeout wins the race, avoiding an unhandled rejection in the
    // background hook.
    const capturePromise = captureScreenshotInSandbox(
      {
        runInProject: (command: string, args: string[] = []) => runInProject(sandbox, command, args),
      },
      url,
    ).catch(() => null)
    let captureTimer: NodeJS.Timeout | null = null
    const captureTimeout = new Promise<string | null>((resolve) => {
      captureTimer = setTimeout(() => resolve(null), 90_000) // 90s cap
    })
    const base64 = await Promise.race([capturePromise, captureTimeout])
    if (captureTimer) clearTimeout(captureTimer)
    if (!base64) {
      await logger.info('Automatic visual QA skipped - screenshot capture failed')
      return
    }

    const critique = await critiqueScreenshot(base64, prompt)

    await saveVisualQaRun({
      taskId,
      userId,
      url,
      prompt,
      verdict: extractVerdict(critique),
      critique,
      screenshotBase64: base64,
    })

    await logger.success('Automatic visual QA completed')
  } catch (error) {
    console.error('Automatic visual QA failed:', error)
    await logger.info('Automatic visual QA failed - continuing task completion')
  }
}
