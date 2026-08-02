import type { Sandbox } from '@vercel/sandbox'
import * as ts from 'typescript'
import { z } from 'zod'
import { runCommandInSandbox } from '@/lib/sandbox/commands'

// Using raw function instead of the tool wrapper if it complains with the specific sdk version
export const readFileAstTool = {
  description:
    'Read a TypeScript file and return its Abstract Syntax Tree (AST) summary (functions, classes, interfaces).',
  inputSchema: z.object({
    filePath: z.string().describe('The path to the file relative to the project root.'),
    fileContent: z.string().describe('The content of the file (fetched prior to calling this).'),
  }),
  execute: async (args: any) => {
    try {
      const sourceFile = ts.createSourceFile(args.filePath, args.fileContent, ts.ScriptTarget.Latest, true)

      const summary: string[] = []

      function visit(node: ts.Node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          summary.push(`Function: ${node.name.text}`)
        } else if (ts.isClassDeclaration(node) && node.name) {
          summary.push(`Class: ${node.name.text}`)
        } else if (ts.isInterfaceDeclaration(node)) {
          summary.push(`Interface: ${node.name.text}`)
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)

      return {
        summary: summary.join('\n'),
        message: `Successfully analyzed AST for ${args.filePath}`,
      }
    } catch (error) {
      return {
        error: `Failed to analyze AST: ${error}`,
      }
    }
  },
}

export const writeFilePatchTool = (sandbox: Sandbox) => ({
  description: 'Apply a search-and-replace patch to a file in the sandbox.',
  inputSchema: z.object({
    filePath: z.string().describe('The path to the file to modify.'),
    searchString: z.string().describe('The exact string to search for in the file.'),
    replaceString: z.string().describe('The string to replace the searchString with.'),
  }),
  execute: async (args: any) => {
    try {
      // Read the file content
      const readResult = await runCommandInSandbox(sandbox, 'cat', [args.filePath])

      if (!readResult.success || !readResult.output) {
        return {
          error: `Failed to read file: ${args.filePath}`,
        }
      }

      const fileContent = readResult.output

      // Validate that searchString exists in the file
      if (!fileContent.includes(args.searchString)) {
        return {
          error: `Search string not found in file: ${args.filePath}`,
        }
      }

      // Perform the replacement
      const updatedContent = fileContent.replace(args.searchString, args.replaceString)

      // Write the updated content back to the file
      const writeResult = await runCommandInSandbox(sandbox, 'bash', [
        '-c',
        `cat > ${args.filePath} << 'EOF'\n${updatedContent}\nEOF`,
      ])

      if (!writeResult.success) {
        return {
          error: `Failed to write file: ${args.filePath}`,
        }
      }

      return {
        message: `Patch applied to ${args.filePath}`,
      }
    } catch (error) {
      return {
        error: `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})

export const runBashWithTimeoutTool = (sandbox: Sandbox) => ({
  description: 'Run a bash command in the sandbox with a timeout and security constraints.',
  inputSchema: z.object({
    command: z.string().describe('The bash command to run.'),
    timeoutMs: z.number().optional().default(10000).describe('Timeout in milliseconds (default 10s).'),
  }),
  execute: async (args: any) => {
    try {
      // Command allowlist for security
      const allowedCommands = [
        'npm',
        'npx',
        'node',
        'git',
        'cat',
        'ls',
        'pwd',
        'echo',
        'mkdir',
        'rm',
        'cp',
        'mv',
        'grep',
        'find',
        'sed',
        'awk',
        'tsc',
        'eslint',
        'prettier',
        'test',
        'jest',
        'vitest',
      ]

      // Extract the first command from the command string
      const firstCommand = args.command.trim().split(/\s+/)[0]
      if (!allowedCommands.includes(firstCommand)) {
        return {
          error: `Command not allowed: ${firstCommand}. Only approved commands are permitted.`,
        }
      }

      let executionPromise: Promise<any>
      let timeoutId: NodeJS.Timeout | null = null

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Command execution timed out after ${args.timeoutMs}ms`))
        }, args.timeoutMs)
      })

      executionPromise = runCommandInSandbox(sandbox, 'bash', ['-c', args.command])

      const result = await Promise.race([executionPromise, timeoutPromise])

      // Clear timeout if execution completed
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      return {
        exitCode: result.exitCode,
        output: result.output ? result.output.slice(0, 5000) : '',
        error: result.error ? result.error.slice(0, 5000) : '',
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})
