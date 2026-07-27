import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { SandboxBridge } from '../runtime/sandbox-bridge'

export function createBrowserTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  const browserCommand = 'agent-browser'

  return {
    browserNavigate: tool({
      description: 'Navigate the browser to a URL. Requires browser mode enabled on the task.',
      inputSchema: z.object({
        url: z.string().describe('The URL to navigate to'),
      }),
      execute: async ({ url }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          const result = await bridge.runInProject(browserCommand, ['open', url])
          if (!result.success) return `Browser navigation failed: ${result.error || 'Unknown error'}`
          return `Navigated to ${url}`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserClick: tool({
      description: 'Click on an element on the current page. Use a CSS selector to identify the element.',
      inputSchema: z.object({
        selector: z.string().describe('CSS selector for the element to click'),
      }),
      execute: async ({ selector }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          const result = await bridge.runInProject(browserCommand, ['click', selector])
          if (!result.success) return `Click failed: ${result.error || 'Unknown error'}`
          return `Clicked element "${selector}"`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserFill: tool({
      description: 'Fill a form input field with a value. Use a CSS selector to identify the input.',
      inputSchema: z.object({
        selector: z.string().describe('CSS selector for the input element'),
        value: z.string().describe('The value to type into the input'),
      }),
      execute: async ({ selector, value }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          const result = await bridge.runInProject(browserCommand, ['fill', selector, value])
          if (!result.success) return `Fill failed: ${result.error || 'Unknown error'}`
          return `Filled "${selector}" with "${value}"`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserSnapshot: tool({
      description: 'Get the current page snapshot (a11y tree) showing all interactive elements. Use after navigation to understand the page layout.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          const result = await bridge.runInProject(browserCommand, ['snapshot'])
          if (!result.success) return `Snapshot failed: ${result.error || 'Unknown error'}`
          return result.output || 'Page snapshot is empty'
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    browserScreenshot: tool({
      description: 'Take a screenshot of the current page. Returns a description of what was captured.',
      inputSchema: z.object({
        selector: z.string().optional().describe('Optional CSS selector to screenshot a specific element'),
      }),
      execute: async ({ selector }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot control browser'
        try {
          const args = selector ? [selector] : []
          const result = await bridge.runInProject(browserCommand, ['screenshot', ...args])
          if (!result.success) return `Screenshot failed: ${result.error || 'Unknown error'}`
          return `Screenshot taken${selector ? ` of "${selector}"` : ''}`
        } catch (error) {
          return `Browser error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
