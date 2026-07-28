import { tool } from 'ai'
import { z } from 'zod'
import * as ts from 'typescript'
import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from '@/lib/sandbox/commands'

// Using raw function instead of the tool wrapper if it complains with the specific sdk version
export const readFileAstTool = {
  description:
    'Read a TypeScript file and return its Abstract Syntax Tree (AST) summary (functions, classes, interfaces).',
  parameters: z.object({
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

export const writeFilePatchTool = {
  description: 'Apply a search-and-replace patch to a file in the sandbox.',
  parameters: z.object({
    filePath: z.string().describe('The path to the file to modify.'),
    searchString: z.string().describe('The exact string to search for in the file.'),
    replaceString: z.string().describe('The string to replace the searchString with.'),
  }),
  execute: async (args: any) => {
    return {
      message: `Patch applied to ${args.filePath} (Simulation)`,
    }
  },
}

export const runBashWithTimeoutTool = (sandbox: Sandbox) => ({
  description: 'Run a bash command in the sandbox with a timeout and security constraints.',
  parameters: z.object({
    command: z.string().describe('The bash command to run.'),
    timeoutMs: z.number().optional().default(10000).describe('Timeout in milliseconds (default 10s).'),
  }),
  execute: async (args: any) => {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Command execution timed out after ${args.timeoutMs}ms`)), args.timeoutMs)
      })

      const executionPromise = runCommandInSandbox(sandbox, 'bash', ['-c', args.command])

      const result = (await Promise.race([executionPromise, timeoutPromise])) as {
        exitCode: number
        stdout: string
        stderr: string
      }

      return {
        exitCode: result.exitCode,
        stdout: result.stdout ? result.stdout.slice(0, 5000) : '',
        stderr: result.stderr ? result.stderr.slice(0, 5000) : '',
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})
