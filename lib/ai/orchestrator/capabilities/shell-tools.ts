import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { SandboxBridge } from '../runtime/sandbox-bridge'

export function createShellTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  return {
    bash: tool({
      description:
        'Execute a shell command in the project sandbox. Use for running build commands, tests, scripts, and any CLI operations.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute'),
        args: z.array(z.string()).optional().describe('Command arguments'),
        timeout: z
          .number()
          .min(1000)
          .max(300000)
          .optional()
          .default(60000)
          .describe('Timeout in milliseconds (max 300s)'),
        description: z.string().optional().describe('What this command does (for logging)'),
      }),
      execute: async ({ command, args, timeout, description }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot run commands'
        try {
          const result = await bridge.runInProject(command, args || [])
          let output = description ? `Command: ${description}\n` : ''
          if (result.exitCode !== undefined) output += `Exit code: ${result.exitCode}\n`
          if (result.output) {
            const truncated =
              result.output.length > 10000 ? result.output.slice(0, 10000) + '\n... (output truncated)' : result.output
            output += truncated
          }
          if (result.error) output += `\nStderr: ${result.error}`
          return output || 'Command executed (no output)'
        } catch (error) {
          return `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    monitor: tool({
      description:
        'Run a long-lived command with streaming output. Best for dev servers, watch mode, or any process that produces ongoing output.',
      inputSchema: z.object({
        command: z.string().describe('The command to run'),
        args: z.array(z.string()).optional().describe('Command arguments'),
        description: z.string().optional().describe('What this process does'),
      }),
      execute: async ({ command, args, description }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot run commands'
        try {
          const result = await bridge.runInProject(command, args || [])
          let output = description ? `Process: ${description}\n` : ''
          output += `Status: ${result.success ? 'completed' : 'failed'}`
          if (result.output) output += `\n${result.output.slice(0, 5000)}`
          if (result.error) output += `\n${result.error}`
          return output
        } catch (error) {
          return `Error running process: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
