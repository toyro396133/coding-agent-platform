/**
 * Auto-Fix Loop Engine
 *
 * When a pipeline stage fails (type error, test failure, lint issue),
 * this module feeds the error back to an LLM, generates a structured fix,
 * applies it to the sandbox, and re-runs the stage.
 *
 * Inspired by Devin's auto-fix loop and the existing test-runner remediation.
 */

import type { Sandbox } from '@vercel/sandbox'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getModelClient } from '@/lib/ai/models'
import type { TaskLogger } from '@/lib/utils/task-logger'
import { PROJECT_DIR, runInProject } from './commands'

// ─── Types ──────────────────────────────────────────────────────────────

export interface AutoFixAttempt {
  attemptNumber: number
  success: boolean
  error?: string
  appliedFix?: AutoFixPatch
  durationMs: number
}

export interface AutoFixPatch {
  explanation: string
  fileEdits: Array<{
    filePath: string
    newContent: string
  }>
}

export interface AutoFixResult {
  success: boolean
  attempts: AutoFixAttempt[]
  totalDurationMs: number
  /** The error output that was fixed (or last error if all failed) */
  finalError?: string
}

export interface AutoFixConfig {
  sandbox: Sandbox
  stageName: string
  errorOutput: string
  logger: TaskLogger
  /** Project root path inside the sandbox */
  projectDir?: string
  /** Max auto-fix attempts (default: 3) */
  maxAttempts?: number
  /** Optional additional context for the LLM (e.g., test code excerpt) */
  context?: string
  /** Model to use for generating fixes (default: gpt-4o-mini) */
  model?: string
  /** A function that re-runs the failing stage and returns { success, error } */
  rerunStage: () => Promise<{ success: boolean; error?: string; output?: string }>
}

// The AI's structured output for a fix
const autoFixSchema = z.object({
  explanation: z.string().describe('Short explanation of what caused the error and how this fix resolves it'),
  fileEdits: z
    .array(
      z.object({
        filePath: z.string().describe('Path relative to project root, e.g. src/components/Button.tsx'),
        newContent: z.string().describe('Complete new file content with the fix applied'),
      }),
    )
    .describe('Array of files to modify with their complete new content'),
})

// ─── Main Loop ──────────────────────────────────────────────────────────

/**
 * Run the auto-fix loop: generate a fix, apply it, re-run the stage,
 * and repeat up to `maxAttempts` times.
 *
 * Returns the final result with all attempt details.
 */
export async function runAutoFixLoop(config: AutoFixConfig): Promise<AutoFixResult> {
  const {
    sandbox,
    stageName,
    errorOutput,
    logger,
    projectDir = PROJECT_DIR,
    maxAttempts = 3,
    context = '',
    model: modelName = 'gpt-4o-mini',
    rerunStage,
  } = config

  const startTime = Date.now()
  const attempts: AutoFixAttempt[] = []
  let lastError = errorOutput

  await logger.info(`🔄 Auto-fix loop started for "${stageName}" (max ${maxAttempts} attempts)`)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now()
    await logger.info(`🔧 Auto-fix attempt ${attempt}/${maxAttempts}...`)

    try {
      // Step 1: Generate a fix using the LLM
      const fix = await generateFix(sandbox, stageName, lastError, projectDir, context, modelName)

      if (!fix.fileEdits || fix.fileEdits.length === 0) {
        await logger.info('⚠️ LLM did not generate any file edits')
        attempts.push({
          attemptNumber: attempt,
          success: false,
          error: 'No file edits generated',
          durationMs: Date.now() - attemptStart,
        })
        continue
      }

      // Step 2: Apply the generated fix to the sandbox
      await logger.info(`📝 Applying fix: ${fix.explanation.slice(0, 120)}...`)
      const applySuccess = await applyFixToSandbox(sandbox, fix, projectDir)

      if (!applySuccess) {
        await logger.error('❌ Failed to write fix files to sandbox')
        attempts.push({
          attemptNumber: attempt,
          success: false,
          error: 'Failed to write fix files',
          durationMs: Date.now() - attemptStart,
        })
        continue
      }

      // Step 3: Re-run the failing stage
      await logger.info('🔄 Re-running stage after fix...')
      const rerunResult = await rerunStage()

      const attemptDuration = Date.now() - attemptStart

      if (rerunResult.success) {
        // Success!
        await logger.success(`✅ Auto-fix attempt ${attempt} succeeded!`)
        attempts.push({
          attemptNumber: attempt,
          success: true,
          appliedFix: fix,
          durationMs: attemptDuration,
        })
        return {
          success: true,
          attempts,
          totalDurationMs: Date.now() - startTime,
        }
      }

      // Failed — feed the new error back for the next attempt
      lastError = rerunResult.error || rerunResult.output || lastError
      await logger.info(`❌ Attempt ${attempt} failed, retrying...`)
      attempts.push({
        attemptNumber: attempt,
        success: false,
        error: (rerunResult.error || rerunResult.output || 'Unknown error').slice(0, 500),
        appliedFix: fix,
        durationMs: attemptDuration,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Auto-fix attempt crashed'
      await logger.error(`❌ Auto-fix attempt ${attempt} error: ${errorMsg.slice(0, 200)}`)
      attempts.push({
        attemptNumber: attempt,
        success: false,
        error: errorMsg,
        durationMs: Date.now() - attemptStart,
      })
    }
  }

  // All attempts failed
  await logger.error(`❌ Auto-fix exhausted after ${maxAttempts} attempts`)
  return {
    success: false,
    attempts,
    totalDurationMs: Date.now() - startTime,
    finalError: lastError,
  }
}

// ─── Fix Generation ─────────────────────────────────────────────────────

/**
 * Ask the LLM to generate a fix for the given error.
 * The LLM returns structured file edits.
 */
async function generateFix(
  sandbox: Sandbox,
  stageName: string,
  errorOutput: string,
  projectDir: string,
  context: string,
  modelName: string,
): Promise<AutoFixPatch> {
  const model = getModelClient(modelName)

  // Read relevant file contents for context
  const fileContext = await gatherFileContext(sandbox, errorOutput, projectDir)

  const systemPrompt = [
    `You are an expert auto-fix agent. Your job is to analyze an error from the "${stageName}" stage and generate precise code fixes.`,
    '',
    'RULES:',
    '- Provide the COMPLETE new content for each file you modify (not just a diff)',
    '- Only modify files necessary to fix the error',
    '- Do NOT introduce new features or unrelated changes',
    '- Ensure the fix is minimal and targeted',
    '- If there are multiple errors, fix ALL of them',
  ].join('\n')

  const userPrompt = [
    `## Stage: ${stageName}`,
    '',
    `## Error Output:`,
    '```',
    errorOutput.slice(0, 5000),
    '```',
    '',
    context ? `## Additional Context:\n${context}\n` : '',
    '',
    fileContext ? `## Relevant File Contents:\n${fileContext}\n` : '',
    '',
    '## Instructions:',
    `Fix the "${stageName}" errors above. Return the exact file paths and their COMPLETE new content.`,
    'Only include files that need to be changed.',
    '',
    'IMPORTANT: File paths must be relative to the project root (e.g. "src/index.ts" not "/vercel/sandbox/project/src/index.ts").',
  ].join('\n')

  const { object } = await generateObject({
    model,
    schema: autoFixSchema,
    system: systemPrompt,
    prompt: userPrompt,
  })

  return object as AutoFixPatch
}

// ─── File Context Gathering ─────────────────────────────────────────────

/**
 * Try to extract file paths from the error output and read their contents
 * to give the LLM context for fixing.
 */
async function gatherFileContext(sandbox: Sandbox, errorOutput: string, projectDir: string): Promise<string> {
  // Extract file paths from error output (e.g., "src/foo.ts:12:5" or "src/foo.ts(12,5)")
  // Note: supports @scoped packages, #/~ path aliases, and common source extensions
  const projectPrefix = projectDir.replace('/vercel/sandbox/', '')
  const filePathRegex =
    // NB: longer extensions FIRST in alternation so .tsx is not captured as .ts
    /(?:\/vercel\/sandbox\/project\/)?([a-zA-Z0-9_\-./@#~]+\.(?:tsx|ts|jsx|js|mjs|cjs|css|json))(?::\d+|\(\d+[,:]\d+\))?/g
  const matchedPaths = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = filePathRegex.exec(errorOutput)) !== null) {
    let path = match[1]
    // Strip the project/ prefix if present (only at the start)
    if (path.startsWith(`${projectPrefix}/`)) {
      path = path.slice(projectPrefix.length + 1)
    }
    // Remove leading slashes
    path = path.replace(/^\/+/, '')
    if (path && !path.includes('node_modules') && !path.includes('..')) {
      matchedPaths.add(path)
    }
  }

  // Limit to the most relevant files (first 5)
  const pathsToRead = [...matchedPaths].slice(0, 5)
  if (pathsToRead.length === 0) return ''

  // Read file contents from the sandbox
  const fileContents: string[] = []
  for (const filePath of pathsToRead) {
    try {
      const result = await runInProject(sandbox, 'sh', [
        '-c',
        `cat '${filePath.replace(/'/g, "'\\''")}' 2>/dev/null | head -200`,
      ])
      if (result.success && result.output) {
        fileContents.push(`\`${filePath}\`:\n\`\`\`\n${result.output}\n\`\`\``)
      }
    } catch {
      // File might not exist or be unreadable
    }
  }

  return fileContents.join('\n\n')
}

// ─── Fix Application ────────────────────────────────────────────────────

/**
 * Apply the generated file edits to the sandbox.
 */
async function applyFixToSandbox(sandbox: Sandbox, fix: AutoFixPatch, projectDir: string): Promise<boolean> {
  try {
    // Write each file using the sandbox CLI
    for (const edit of fix.fileEdits) {
      // Reject path traversal attempts
      if (edit.filePath.includes('..')) {
        console.error('Rejected path traversal in auto-fix:', edit.filePath)
        return false
      }

      const fullPath = edit.filePath.startsWith('/') ? edit.filePath : `${projectDir}/${edit.filePath}`

      const b64 = Buffer.from(edit.newContent, 'utf8').toString('base64')
      const escapedPath = fullPath.replace(/'/g, "'\\''")

      // Create directory and write file
      const writeResult = await runInProject(sandbox, 'sh', [
        '-c',
        `mkdir -p "$(dirname '${escapedPath}')" && printf '%s' '${b64}' | base64 -d > '${escapedPath}'`,
      ])

      if (!writeResult.success) {
        console.error('Failed to write file:', edit.filePath, writeResult.error)
        return false
      }
    }
    return true
  } catch (error) {
    console.error('Error applying fix to sandbox:', error)
    return false
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────

/**
 * Format auto-fix results for logger output.
 */
export function formatAutoFixSummary(result: AutoFixResult): string {
  const lines: string[] = []

  if (result.success) {
    lines.push('✅ **Auto-fix succeeded**')
  } else {
    lines.push('❌ **Auto-fix failed**')
  }

  lines.push(`📊 ${result.attempts.length} attempt(s) in ${(result.totalDurationMs / 1000).toFixed(1)}s`)

  for (const attempt of result.attempts) {
    const icon = attempt.success ? '✅' : '❌'
    const duration = `(${(attempt.durationMs / 1000).toFixed(1)}s)`
    const files = attempt.appliedFix?.fileEdits?.length || 0
    const explanation = attempt.appliedFix?.explanation ? ` — ${attempt.appliedFix.explanation.slice(0, 100)}` : ''
    lines.push(`${icon} Attempt ${attempt.attemptNumber} ${duration}: ${files} file(s) modified${explanation}`)
  }

  if (!result.success && result.finalError) {
    lines.push(`\nLast error:\n\`\`\`\n${result.finalError.slice(0, 500)}\n\`\`\``)
  }

  return lines.join('\n')
}
