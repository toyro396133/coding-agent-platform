import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { SandboxBridge } from '../runtime/sandbox-bridge'

export function createFileTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  return {
    readFile: tool({
      description: 'Read a file from the project. Optionally specify offset and limit to read a portion of the file.',
      inputSchema: z.object({
        path: z.string().describe('Absolute or project-relative path to the file'),
        offset: z.number().min(0).optional().describe('Byte offset to start reading from'),
        limit: z.number().min(1).max(100000).optional().describe('Maximum number of bytes to read'),
      }),
      execute: async ({ path, offset, limit }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot read files'
        try {
          return await bridge.readFile(path, offset, limit)
        } catch (error) {
          return `Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    writeFile: tool({
      description: 'Create or overwrite a file in the project with the given content.',
      inputSchema: z.object({
        path: z.string().describe('Absolute or project-relative path to the file'),
        content: z.string().describe('The content to write'),
      }),
      execute: async ({ path, content }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot write files'
        try {
          await bridge.writeFile(path, content)
          return `File written: ${path} (${Buffer.byteLength(content, 'utf8')} bytes)`
        } catch (error) {
          return `Error writing file: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    editFile: tool({
      description:
        'Edit a file by replacing text. Uses exact string matching (not regex). Use replaceAll to replace every occurrence.',
      inputSchema: z.object({
        path: z.string().describe('Absolute or project-relative path to the file'),
        oldString: z.string().describe('The exact text to replace'),
        newString: z.string().describe('The replacement text'),
        replaceAll: z.boolean().optional().default(false).describe('Replace all occurrences (default: only first)'),
      }),
      execute: async ({ path, oldString, newString, replaceAll }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot edit files'
        try {
          await bridge.editFile(path, oldString, newString, replaceAll)
          return `File edited: ${path}`
        } catch (error) {
          return `Error editing file: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    glob: tool({
      description: 'Find files by glob pattern in the project. Supports wildcards like **/*.ts, *.json, etc.',
      inputSchema: z.object({
        pattern: z.string().describe('Glob pattern to match (e.g., "**/*.ts", "*.json", "src/**/*.tsx")'),
        path: z.string().optional().default('.').describe('Base directory to search from'),
      }),
      execute: async ({ pattern, path }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot search files'
        try {
          const files = await bridge.glob(pattern, path)
          if (files.length === 0) return 'No files found matching the pattern'
          return `Found ${files.length} file(s):\n${files.join('\n')}`
        } catch (error) {
          return `Error searching files: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    grep: tool({
      description:
        'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.',
      inputSchema: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
        path: z.string().optional().default('.').describe('Directory or file to search in'),
        include: z.string().optional().describe('File pattern to filter (e.g., "*.ts", "*.{ts,tsx}")'),
      }),
      execute: async ({ pattern, path, include }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot search file contents'
        try {
          const matches = await bridge.grep(pattern, path, include)
          if (matches.length === 0) return 'No matches found'
          return `Found ${matches.length} match(es):\n${matches.join('\n')}`
        } catch (error) {
          return `Error searching content: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
