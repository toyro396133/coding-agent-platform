import { tool } from 'ai'
import { z } from 'zod'
import { SandboxBridge } from '../runtime/sandbox-bridge'
import { type AiderRepoMapResult, buildAiderRepoMapText, extractFileSymbols, type RepoMapFile } from './aider-repo-map'
import type { ToolContext } from './types'

/** Extensions we can extract symbols from (AST or regex fallback). */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyw', '.go']

export interface BuildRepoMapOptions {
  rootDir?: string
  maxFiles?: number
  maxTokens?: number
  maxSymbolsPerFile?: number
}

/**
 * List source files in the sandbox, ranked so the most useful files land first
 * within the token budget. Ranking heuristic (Aider uses pagerank; we
 * approximate with): shallower files first (entry points, configs), then
 * alphabetical — deterministic and cheap.
 */
export async function listSourceFiles(bridge: SandboxBridge, rootDir: string, maxFiles: number): Promise<string[]> {
  // NOTE: runInProject escapes every arg and pipes the whole command through
  // `sh -c`. A literal '|' arg would be quoted and NOT act as a pipe, so we run
  // the pipeline via `sh -c` (matching the project's existing pattern) instead.
  // Quote rootDir so paths with spaces/quotes stay intact inside the inner sh.
  const quotedRoot = rootDir.replace(/'/g, "'\\''")
  const findCmd = [
    `find '${quotedRoot}'`,
    '-type f',
    "-not -path '*/node_modules/*'",
    "-not -path '*/.git/*'",
    "-not -path '*/dist/*'",
    "-not -path '*/.next/*'",
    "-not -path '*/build/*'",
    "-not -path '*/coverage/*'",
    "-not -path '*/package-lock.json'",
    "-not -path '*/yarn.lock'",
    "-not -path '*/pnpm-lock.yaml'",
    "-not -path '*/.aider.tags.cache/*'",
    `| head -${maxFiles * 20}`,
  ].join(' ')

  const dirsResult = await bridge.runInProject('sh', ['-c', findCmd])

  const files = dirsResult.output ? dirsResult.output.trim().split('\n').filter(Boolean) : []

  const sourceFiles = files.filter((f: string) => {
    const lower = f.toLowerCase()
    return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext))
  })

  return sourceFiles
    .map((f: string) => ({ f, depth: f.replace(rootDir, '').split('/').length - 1 }))
    .sort((a, b) => a.depth - b.depth || a.f.localeCompare(b.f))
    .map((x) => x.f)
    .slice(0, maxFiles)
}

/**
 * Build the compressed Aider-style repo map: list files (ranked), extract AST
 * symbol signatures, render a token-budgeted tree. Shared by the on-demand
 * tool and the system-prompt injection path.
 *
 * Semantics of the result: `totalFiles` is every listed source file (ranked),
 * while `filesIncluded` counts only files that produced extractable symbols
 * AND were rendered within the token budget — so `filesIncluded/totalFiles`
 * may under-report when empty/unsupported files exist or the map is truncated.
 */
export async function buildRepoMap(
  bridge: SandboxBridge,
  options: BuildRepoMapOptions = {},
): Promise<AiderRepoMapResult> {
  const rootDir = (options.rootDir || '.').replace(/\/$/, '')
  const maxFiles = options.maxFiles || 100
  const maxTokens = options.maxTokens || 1024
  const maxSymbolsPerFile = options.maxSymbolsPerFile ?? 12

  if (!bridge.isAvailable()) {
    return { text: '', filesIncluded: 0, totalFiles: 0, truncated: false }
  }

  try {
    const files = await listSourceFiles(bridge, rootDir, maxFiles)
    const totalFiles = files.length
    const repoFiles: RepoMapFile[] = []

    // Read files in parallel batches (bounded concurrency keeps the sandbox
    // busy without overwhelming it)
    const BATCH = 8
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await bridge.readFile(file)
            if (!content) return null
            const relPath = file.replace(`${rootDir}/`, '').replace(rootDir, '.').replace(/^\.\//, '')
            return { relPath, symbols: extractFileSymbols(content, file) } as RepoMapFile
          } catch {
            return null
          }
        }),
      )
      for (const r of results) if (r) repoFiles.push(r)
    }

    const rendered = buildAiderRepoMapText(repoFiles, { maxTokens, maxSymbolsPerFile })
    return { ...rendered, totalFiles }
  } catch {
    return { text: '', filesIncluded: 0, totalFiles: 0, truncated: false }
  }
}

/**
 * Repo Map — generates a compressed, Aider-style structural overview of the
 * codebase: a token-budgeted file hierarchy with AST symbol signatures.
 *
 * Inspired by Aider's `repomap`: the agent gets the same codebase understanding
 * as reading every file, at a fraction of the tokens. The map can also be built
 * ahead of time and injected into the system prompt (see loop.ts) — this pack
 * provides the on-demand tools to refresh it.
 */
export function createRepoMapTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  return {
    generateRepoMap: tool({
      description: `Generate a compressed, Aider-style repo map of the project: a token-budgeted file hierarchy with AST symbol signatures (functions, classes + methods, interfaces, types, enums, exported consts). Use this *first* to understand the codebase structure. This saves tokens by summarizing the codebase instead of reading every file individually.`,
      inputSchema: z.object({
        rootDir: z.string().optional().default('.').describe('Root directory to map (relative to project root)'),
        maxFiles: z
          .number()
          .min(5)
          .max(300)
          .optional()
          .default(100)
          .describe('Maximum number of source files to include in the map'),
        maxTokens: z
          .number()
          .min(256)
          .max(8000)
          .optional()
          .default(1024)
          .describe('Token budget for the rendered map (Aider map_max_tokens)'),
      }),
      execute: async ({ rootDir, maxFiles, maxTokens }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot read files'

        try {
          const result = await buildRepoMap(bridge, { rootDir, maxFiles, maxTokens })
          if (!result.text) return 'No source files found in repository.'
          const header = `🧭 REPO MAP (${result.filesIncluded}/${result.totalFiles} files, ${result.truncated ? 'truncated to budget' : 'complete'})`
          return `${header}\n${result.text}`
        } catch (error) {
          return `Error generating repo map: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    getFileStructure: tool({
      description: `Get a compact AST summary of a specific file: function/class/interface/type/enum/const signatures. Use this to understand a specific file's API without reading its entire content.`,
      inputSchema: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
      }),
      execute: async ({ filePath }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot read files'

        try {
          const content = await bridge.readFile(filePath)
          if (!content) return `File not found or empty: ${filePath}`
          const symbols = extractFileSymbols(content, filePath)
          if (symbols.length === 0) {
            return `📄 FILE STRUCTURE: ${filePath}\n(no extractable symbols — empty or unsupported file type)`
          }
          const lines = symbols.map((s) => {
            const base = `  ├── ${s.signature}`
            if (s.methods && s.methods.length > 0) {
              const methods = s.methods.map((m) => `  │       ├── ${m}`).join('\n')
              return `${base}\n${methods}`
            }
            return base
          })
          return `📄 FILE STRUCTURE: ${filePath}\n\n${lines.join('\n')}`
        } catch (error) {
          return `Error reading file structure: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
