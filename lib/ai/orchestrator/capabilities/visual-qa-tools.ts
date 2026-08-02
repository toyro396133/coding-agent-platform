import { generateText, tool } from 'ai'
import { z } from 'zod'
import { getModelClient } from '@/lib/ai/models'
import { withRetry } from '@/lib/ai/retry'
import type { CommandResult } from '@/lib/sandbox/commands'
import { SandboxBridge } from '../runtime/sandbox-bridge'
import type { ToolContext } from './types'
import { saveVisualQaRun, type VisualQaVerdict } from './visual-qa-store'

/**
 * Minimal runner interface so screenshot capture works both with the
 * orchestrator's SandboxBridge and with a raw Sandbox (auto visual QA).
 */
export interface ScreenshotRunner {
  runInProject(command: string, args?: string[]): Promise<CommandResult>
}

/**
 * Visual QA capability — captures a screenshot of a running app and sends it
 * to a vision model for critique. This closes the loop for UI work: after the
 * agent implements frontend changes, it can visually verify the result and
 * iterate on the feedback instead of guessing.
 *
 * Flow:
 *   1. Playwright (in the sandbox) navigates to the URL and screenshots it
 *   2. The image is base64-encoded and returned to the orchestrator process
 *   3. A vision model (gpt-4o / AI Gateway fallback) critiques it against the
 *      critique prompt
 *   4. The textual critique is returned to the agent for remediation
 */
export function createVisualQaTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  return {
    visualQaCritique: tool({
      description:
        'Capture a screenshot of a URL (usually the app being built, e.g. http://localhost:3000) and have a vision model critique its visual quality against your criteria. Use this after UI/frontend changes to verify the result looks correct — the critique will list specific issues and suggestions to fix. Returns structured findings the model can act on.',
      inputSchema: z.object({
        url: z.string().min(1).describe('The URL to screenshot (e.g. http://localhost:3000)'),
        prompt: z
          .string()
          .min(1)
          .describe(
            'What to evaluate visually — e.g. "Is the layout clean and aligned? Are there overlapping elements, broken styles, or missing content? Rate the design quality and list concrete improvements."',
          ),
        maxScreenshotHeight: z
          .number()
          .optional()
          .describe(
            'Limit the screenshot height in pixels to keep the image small (default 2000). Pass 0 for a true full-page capture.',
          ),
      }),
      execute: async ({ url, prompt, maxScreenshotHeight }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot capture a screenshot'
        try {
          // 1. Screenshot in the sandbox with Playwright
          const base64 = await captureScreenshotInSandbox(bridge, url, maxScreenshotHeight)
          if (!base64) return 'Screenshot capture failed — is the URL reachable from the sandbox?'

          // 2. Send to a vision model
          const critique = await critiqueScreenshot(base64, prompt)

          // 3. Persist the run for the task UI history
          await persistRun(ctx, url, prompt, critique, base64)

          return critique
        } catch (error) {
          return `Visual QA failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    visualQaLoop: tool({
      description:
        'Run one visual QA round against your acceptance criteria: screenshot the URL, get a vision-model verdict (PASS or FAIL) plus concrete fixes. If the verdict is FAIL, apply the fixes to the code, rebuild if needed, then re-invoke this tool to re-verify. Iterate by re-invoking until the verdict is PASS.',
      inputSchema: z.object({
        url: z.string().min(1).describe('The URL to screenshot (e.g. http://localhost:3000)'),
        criteria: z
          .string()
          .min(1)
          .describe(
            'The visual acceptance criteria — e.g. "A centered hero with a heading, a call-to-action button, and a footer. No overlapping text."',
          ),
        maxScreenshotHeight: z
          .number()
          .optional()
          .describe(
            'Limit the screenshot height in pixels to keep the image small (default 2000). Pass 0 for a true full-page capture.',
          ),
      }),
      execute: async ({ url, criteria, maxScreenshotHeight }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot capture a screenshot'
        try {
          const base64 = await captureScreenshotInSandbox(bridge, url, maxScreenshotHeight)
          if (!base64) return 'Screenshot capture failed — is the URL reachable from the sandbox?'

          const critique = await critiqueScreenshot(base64, criteria)
          const passed = parseVerdict(critique)

          // Persist the run for the task UI history
          await persistRun(ctx, url, criteria, critique, base64)

          const verdict = passed
            ? '✅ VISUAL QA PASSED — the UI meets the acceptance criteria. No further action needed.'
            : '❌ VISUAL QA FAILED — apply the fixes above to the code, rebuild if needed, then re-invoke visualQaLoop to re-verify.'

          return `${critique}\n\n${verdict}`
        } catch (error) {
          return `Visual QA failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}

/**
 * Extract the verdict from the vision model's critique. The critique prompt
 * instructs the model to respond with "1. Verdict: PASS or FAIL", so we parse
 * that line precisely instead of fuzzy substring matching.
 */
export function extractVerdict(critique: string): VisualQaVerdict {
  // Match a "verdict:" line and capture the text that follows the colon.
  const lineMatch = critique.match(/verdict\s*:([^\n]*)/i)
  const rest = lineMatch ? lineMatch[1] : ''

  // A coordinated verdict ("PASS or FAIL") means the model echoed the
  // instruction template instead of filling it in — treat as unresolved.
  if (/\bor\b/i.test(rest)) return 'unknown'

  const verdict = rest.match(/\b(pass|fail)\b/i)
  if (!verdict) return 'unknown'
  return verdict[1].toLowerCase() === 'pass' ? 'pass' : 'fail'
}

/**
 * Boolean helper used by the loop tool's verdict message.
 */
function parseVerdict(critique: string): boolean {
  return extractVerdict(critique) === 'pass'
}

/**
 * Best-effort persistence of a visual QA run into the task history.
 * saveVisualQaRun already swallows DB errors, so a failure here can never
 * break the tool. Skipped when no user is attached to the task (the FK would
 * fail anyway).
 */
async function persistRun(
  ctx: ToolContext,
  url: string,
  prompt: string,
  critique: string,
  screenshotBase64: string,
): Promise<void> {
  if (!ctx.userId) return
  await saveVisualQaRun({
    taskId: ctx.taskId,
    userId: ctx.userId,
    url,
    prompt,
    verdict: extractVerdict(critique),
    critique,
    screenshotBase64,
  })
}

/**
 * Run a Playwright script inside the sandbox that screenshots the URL and
 * returns the image as a base64 string (compact, single-line output).
 * Validates that the payload is a real JPEG before returning it.
 */
export async function captureScreenshotInSandbox(
  runner: ScreenshotRunner,
  url: string,
  maxHeight?: number,
): Promise<string | null> {
  // Ensure playwright is available
  const check = await runner.runInProject('node', ['-e', 'require("playwright"); console.log("ok")'])
  if (!check.success) {
    const install = await runner.runInProject('npm', ['install', 'playwright'])
    if (!install.success) return null
    const chromium = await runner.runInProject('npx', ['playwright', 'install', 'chromium'])
    if (!chromium.success) return null
  }

  const escaped = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  // Cap the height by default so the base64 payload stays within sandbox
  // stdout limits; the caller can pass 0 for a true full-page capture.
  const height = maxHeight === undefined ? 2000 : maxHeight
  const fullPage = height <= 0

  const script = `(async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('${escaped}', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const opts = { type: 'jpeg', quality: 70 };
  if (${fullPage}) {
    opts.fullPage = true;
  } else {
    opts.clip = { x: 0, y: 0, width: 1280, height: Math.min(${height || 2000}, 4000) };
  }
  await page.screenshot({ path: '/tmp/vqa.jpg', ...opts });
  await browser.close();
  const b64 = fs.readFileSync('/tmp/vqa.jpg').toString('base64');
  console.log('VQA_B64:' + b64);
})()`

  const result = await runner.runInProject('node', ['-e', script])
  const output = result.output || ''
  const marker = 'VQA_B64:'
  const idx = output.indexOf(marker)
  if (idx === -1) return null

  const base64 = output.slice(idx + marker.length).trim()

  // Sanity check: the payload must be a plausible JPEG (SOI marker FF D8).
  if (base64.length < 1000) return null
  try {
    const buf = Buffer.from(base64, 'base64')
    if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  } catch {
    return null
  }

  return base64
}

/**
 * Send the screenshot to a vision model and return the critique text.
 */
export async function critiqueScreenshot(base64: string, prompt: string): Promise<string> {
  const imageBuffer = Buffer.from(base64, 'base64')

  // Prefer a vision-capable model; gpt-4o is available via AI Gateway fallback
  const visionModel = getModelClient('gpt-4o')

  const { text } = await withRetry(
    () =>
      generateText({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a senior UI/UX reviewer performing visual QA on a screenshot of a web app.\n\nCritique prompt: ${prompt}\n\nRespond with:\n1. Verdict: PASS or FAIL against the criteria\n2. Issues found (specific, with locations/selectors when possible)\n3. Concrete fix suggestions\n4. One-line overall quality rating (0-10)\n\nBe concise and actionable.`,
              },
              {
                type: 'image',
                image: imageBuffer,
              },
            ],
          },
        ],
        maxOutputTokens: 1200,
      }),
    { label: 'visual-qa.critique' },
  )

  return text || 'Vision model returned no critique.'
}
