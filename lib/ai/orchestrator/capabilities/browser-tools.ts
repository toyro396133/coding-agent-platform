import { tool } from 'ai'
import { z } from 'zod'
import { SandboxBridge } from '../runtime/sandbox-bridge'
import type { ToolContext } from './types'

export function createBrowserTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  const _browser: any = null
  const _page: any = null

  const ensurePlaywright = async () => {
    if (!bridge.isAvailable()) return false
    const check = await bridge.runInProject('node', ['-e', 'require("playwright"); console.log("ok")'])
    if (check.success) return true
    const installResult = await bridge.runInProject('npm', ['install', 'playwright'])
    if (!installResult.success) return false
    const chromiumResult = await bridge.runInProject('npx', ['playwright', 'install', 'chromium'])
    return chromiumResult.success
  }

  return {
    browserNavigate: tool({
      description: 'Navigate the browser to a URL using Playwright.',
      inputSchema: z.object({
        url: z.string().describe('The URL to navigate to'),
      }),
      execute: async ({ url }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          const ready = await ensurePlaywright()
          if (!ready) return 'Failed to install Playwright'
          const escaped = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
          const script = `(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('${escaped}', { waitUntil: 'networkidle' });
  await browser.close();
  console.log('ok');
})()`
          await bridge.runInProject('node', ['-e', script])
          return `Navigated to ${url}`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserClick: tool({
      description: 'Click on an element on the current page using a CSS selector.',
      inputSchema: z.object({
        selector: z.string().describe('CSS selector for the element to click'),
      }),
      execute: async ({ selector }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          await ensurePlaywright()
          const esc = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
          const script = `(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const el = await page.waitForSelector('${esc}');
  await el.click();
  await browser.close();
  console.log('ok');
})()`
          await bridge.runInProject('node', ['-e', script])
          return `Clicked element "${selector}"`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserFill: tool({
      description: 'Fill a form input with a value using a CSS selector.',
      inputSchema: z.object({
        selector: z.string().describe('CSS selector for the input element'),
        value: z.string().describe('The value to type into the input'),
      }),
      execute: async ({ selector, value }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          await ensurePlaywright()
          const sel = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
          const val = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
          const script = `(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const el = await page.waitForSelector('${sel}');
  await el.fill('${val}');
  await browser.close();
  console.log('ok');
})()`
          await bridge.runInProject('node', ['-e', script])
          return `Filled "${selector}"`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserSnapshot: tool({
      description: 'Get the page text content via Playwright.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          await ensurePlaywright()
          const script = `(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const text = await page.innerText('body');
  await browser.close();
  console.log(text.slice(0, 10000));
})()`
          const result = await bridge.runInProject('node', ['-e', script])
          return result.output || 'Page snapshot is empty'
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserScreenshot: tool({
      description: 'Take a screenshot of the current page.',
      inputSchema: z.object({
        selector: z.string().optional().describe('Optional CSS selector for a specific element'),
      }),
      execute: async ({ selector }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          await ensurePlaywright()
          const hasSelector = selector !== undefined && selector !== ''
          const escapedSel = hasSelector ? selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : ''
          const script = hasSelector
            ? `(async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const el = await page.waitForSelector('${escapedSel}');
  await el.screenshot({ path: '/tmp/screenshot.png' });
  await browser.close();
  const buf = fs.readFileSync('/tmp/screenshot.png');
  console.log('Screenshot saved (' + buf.length + ' bytes)');
})()`
            : `(async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
  await browser.close();
  const buf = fs.readFileSync('/tmp/screenshot.png');
  console.log('Screenshot saved (' + buf.length + ' bytes)');
})()`
          const result = await bridge.runInProject('node', ['-e', script])
          return result.output || 'Screenshot taken'
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
