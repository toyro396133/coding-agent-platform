import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { SandboxBridge } from '../runtime/sandbox-bridge'

/**
 * Repo Map — generates a structural overview of the codebase.
 * Inspired by Aider's repo map: provides a high-level view of
 * classes, functions, imports, and file structure, saving tokens
 * by avoiding reading every file.
 */
export function createRepoMapTools(ctx: ToolContext) {
  const bridge = new SandboxBridge(ctx.taskId)

  /**
   * Generate a compact structural map of a file using basic parsing.
   * Looks for function/class/interface/type declarations, imports, and exports.
   */
  async function generateFileMap(filePath: string): Promise<string> {
    if (!bridge.isAvailable()) return 'No active sandbox — cannot read files'

    const content = await bridge.readFile(filePath)
    if (!content) return ''

    const lines = content.split('\n')
    const maxLines = 200
    const relevantLines: string[] = []
    let structuralCount = 0

    // Collect all structural lines + up to 2 context lines around each
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const line = lines[i]
      const trimmed = line.trim()

      const isStructural =
        trimmed.startsWith('export ') ||
        trimmed.startsWith('import ') ||
        trimmed.startsWith('function ') ||
        trimmed.startsWith('class ') ||
        trimmed.startsWith('interface ') ||
        trimmed.startsWith('type ') ||
        trimmed.startsWith('const ') ||
        trimmed.startsWith('let ') ||
        trimmed.startsWith('async function ') ||
        trimmed.startsWith('export default ') ||
        trimmed.startsWith('enum ') ||
        /^\s*\/(\/|\*)/.test(line) ||
        trimmed.startsWith('def ') ||
        trimmed.startsWith('from ')

      if (isStructural) {
        // Include up to 2 lines of context before for readability
        if (structuralCount === 0 && i >= 2) {
          relevantLines.push(`  // ... ${lines[i - 2].trim()}`)
          relevantLines.push(`  // ... ${lines[i - 1].trim()}`)
        }
        relevantLines.push(line)
        structuralCount++
      } else if (trimmed && structuralCount > 0) {
        // Keep one-line context after a structural element
        relevantLines.push(line)
      }
    }

    if (lines.length > maxLines) {
      relevantLines.push(`// ... (${lines.length - maxLines} more lines)`)
    }

    return relevantLines.join('\n')
  }

  const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.css', '.json']

  return {
    generateRepoMap: tool({
      description: `Generate a structural map of the project repository. This provides a high-level overview of the codebase structure, including file organization, exported symbols, and key dependencies. Use this *first* before making any changes to understand the project structure. This saves tokens by summarizing the codebase instead of reading every file individually.`,
      inputSchema: z.object({
        rootDir: z.string().optional().default('.').describe('Root directory to map (relative to project root)'),
        maxFiles: z
          .number()
          .min(5)
          .max(200)
          .optional()
          .default(50)
          .describe('Maximum number of files to include in the map'),
      }),
      execute: async ({ rootDir, maxFiles }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot read files'

        try {
          // Step 1: Get directory structure (breadth-first)
          const dirResult = await bridge.runInProject('find', [
            rootDir,
            '-type',
            'd',
            '-not',
            '-path',
            '*/node_modules/*',
            '-not',
            '-path',
            '*/.git/*',
            '-not',
            '-path',
            '*/dist/*',
            '-not',
            '-path',
            '*/.next/*',
            '-not',
            '-path',
            '*/build/*',
            '-not',
            '-path',
            '*/coverage/*',
            '|',
            'head',
            '-50',
          ])

          const dirs = dirResult.output
            ? dirResult.output
                .trim()
                .split('\n')
                .filter(Boolean)
                .map((d: string) => d.replace(rootDir + '/', '').replace(rootDir, './'))
            : []

          // Step 2: Get file listing with sizes
          const fileResult = await bridge.runInProject('find', [
            rootDir,
            '-type',
            'f',
            '-not',
            '-path',
            '*/node_modules/*',
            '-not',
            '-path',
            '*/.git/*',
            '-not',
            '-path',
            '*/dist/*',
            '-not',
            '-path',
            '*/.next/*',
            '-not',
            '-path',
            '*/build/*',
            '-not',
            '-path',
            '*/coverage/*',
            '-not',
            '-path',
            '*/package-lock.json',
            '-not',
            '-path',
            '*/yarn.lock',
            '-not',
            '-path',
            '*/pnpm-lock.yaml',
            '|',
            'head',
            `-${maxFiles + 10}`,
          ])

          const allFiles = fileResult.output ? fileResult.output.trim().split('\n').filter(Boolean) : []

          // Filter by include patterns
          const sourceFiles = allFiles.filter((f: string) => {
            const lower = f.toLowerCase()
            return (
              lower.endsWith('.ts') ||
              lower.endsWith('.tsx') ||
              lower.endsWith('.js') ||
              lower.endsWith('.jsx') ||
              lower.endsWith('.py') ||
              lower.endsWith('.go') ||
              lower.endsWith('.css') ||
              lower.endsWith('.json')
            )
          })

          const filesToMap = sourceFiles.slice(0, maxFiles)

          // Step 3: Generate map for each source file (in parallel batches)
          const mapLines: string[] = []
          mapLines.push('='.repeat(60))
          mapLines.push(`📁 REPO MAP: ${rootDir}`)
          mapLines.push(
            `📊 ${dirs.length} directories, ${allFiles.length} total files, ${filesToMap.length} source files`,
          )
          mapLines.push('='.repeat(60))

          // List directory structure
          if (dirs.length > 0) {
            mapLines.push('')
            mapLines.push('📂 DIRECTORY STRUCTURE:')
            for (const dir of dirs.slice(0, 30)) {
              const depth = dir.split('/').length
              const indent = '  '.repeat(depth)
              mapLines.push(`${indent}📁 ${dir.split('/').pop() || dir}/`)
            }
            if (dirs.length > 30) {
              mapLines.push(`  ... (${dirs.length - 30} more directories)`)
            }
          }

          // List files with structural info
          if (filesToMap.length > 0) {
            mapLines.push('')
            mapLines.push('📄 SOURCE FILES:')
            for (const file of filesToMap) {
              const relativePath = file.replace(rootDir + '/', '').replace(rootDir, '.')
              mapLines.push('')
              mapLines.push(`  📄 ${relativePath}`)

              // Add structural summary
              try {
                const fileMap = await generateFileMap(file)
                if (fileMap) {
                  const summaryLines = fileMap.split('\n').slice(0, 15)
                  for (const sl of summaryLines) {
                    mapLines.push(`    ${sl}`)
                  }
                  if (fileMap.split('\n').length > 15) {
                    mapLines.push(`    // ... structural summary truncated`)
                  }
                }
              } catch {
                mapLines.push(`    // (could not parse)`)
              }
            }
          }

          // Step 4: Read package.json for project info
          try {
            const pkgResult = await bridge.readFile(`${rootDir}/package.json`)
            if (pkgResult) {
              try {
                const pkg = JSON.parse(pkgResult)
                mapLines.push('')
                mapLines.push('='.repeat(60))
                mapLines.push('📦 PROJECT INFO:')
                mapLines.push(`  Name: ${pkg.name || 'unnamed'}`)
                if (pkg.description) mapLines.push(`  Description: ${pkg.description}`)
                if (pkg.scripts) {
                  mapLines.push(`  Scripts:`)
                  for (const [name, script] of Object.entries(pkg.scripts)) {
                    mapLines.push(`    ${name}: ${script}`)
                  }
                }
                if (pkg.dependencies) {
                  const deps = Object.keys(pkg.dependencies)
                  mapLines.push(`  Dependencies: ${deps.length} packages`)
                  for (const dep of deps.slice(0, 20)) {
                    mapLines.push(`    ${dep}@${pkg.dependencies[dep]}`)
                  }
                  if (deps.length > 20) {
                    mapLines.push(`    ... (${deps.length - 20} more dependencies)`)
                  }
                }
                if (pkg.devDependencies) {
                  mapLines.push(`  Dev Dependencies: ${Object.keys(pkg.devDependencies).length} packages`)
                }
              } catch {
                mapLines.push(`  // (could not parse package.json)`)
              }
            }
          } catch {
            // No package.json, try requirements.txt for Python
            try {
              const reqResult = await bridge.readFile(`${rootDir}/requirements.txt`)
              if (reqResult) {
                mapLines.push('')
                mapLines.push('='.repeat(60))
                mapLines.push('🐍 PYTHON DEPENDENCIES:')
                const reqs = reqResult.split('\n').filter(Boolean)
                for (const req of reqs.slice(0, 30)) {
                  mapLines.push(`  ${req}`)
                }
                if (reqs.length > 30) {
                  mapLines.push(`  ... (${reqs.length - 30} more dependencies)`)
                }
              }
            } catch {
              // Nothing
            }
          }

          mapLines.push('')
          mapLines.push('='.repeat(60))

          return mapLines.join('\n')
        } catch (error) {
          return `Error generating repo map: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    getFileStructure: tool({
      description: `Get a compact structural overview of a specific file: exported symbols, imports, and key declarations. Use this when you need to understand a specific file's API without reading its entire content.`,
      inputSchema: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
      }),
      execute: async ({ filePath }) => {
        if (!bridge.isAvailable()) return 'No active sandbox — cannot read files'

        try {
          const fileMap = await generateFileMap(filePath)
          if (!fileMap) return `File not found or empty: ${filePath}`
          return `📄 FILE STRUCTURE: ${filePath}\n\n${fileMap}`
        } catch (error) {
          return `Error reading file structure: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
