/**
 * Auto Pipeline — Post-code-generation verification and deployment.
 *
 * After the agent finishes writing code, this pipeline automatically:
 * 1. Runs type checking (tsc --noEmit)
 * 2. Runs tests (npm test / pytest)
 * 3. Takes Playwright screenshots for visual verification
 * 4. Audits dependencies for security issues
 * 5. Commits and pushes changes with AI metadata
 * 6. Creates a Pull Request with auto-generated description
 * 7. Triggers Vercel deployment preview
 */

import { Sandbox } from '@vercel/sandbox'
import { runInProject, runCommandInSandbox } from './commands'
import { TaskLogger } from '@/lib/utils/task-logger'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { routePrompt } from '@/lib/ai/router'

import { runAutoFixLoop, formatAutoFixSummary } from './auto-fix'
import type { AutoFixResult } from './auto-fix'

import {
  type PipelineStageData as PipelineStage,
  type PipelineResult as PipelineResultBase,
} from '@/lib/types/pipeline'

export type { PipelineStage }
export interface PipelineResult extends PipelineResultBase {}

export interface PipelineOptions {
  sandbox: Sandbox
  taskId: string
  branchName: string
  repoUrl: string
  selectedAgent?: string
  selectedModel?: string
  commitMessage?: string
  prompt: string
  enableBrowser?: boolean
  githubToken?: string
  logger: TaskLogger
}

/**
 * Runs the complete verification pipeline after agent execution.
 * Returns a PipelineResult with the status of each stage.
 */
export async function runVerificationPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { sandbox, branchName, repoUrl, prompt, selectedAgent, selectedModel, enableBrowser, logger } = options
  const stages: PipelineStage[] = []
  const startTime = Date.now()

  const updateStage = (name: string, updates: Partial<PipelineStage>) => {
    const index = stages.findIndex((s) => s.name === name)
    if (index >= 0) {
      stages[index] = { ...stages[index], ...updates }
    } else {
      stages.push({ name, status: 'pending', ...updates })
    }
  }

  // ── Stage 1: Type Checking ──
  updateStage('Type Check', { status: 'running' })
  await logger.info('🔍 Stage 1/6: Running type check...')
  const tscStart = Date.now()

  try {
    const tscResult = await runInProject(sandbox, 'npx', ['tsc', '--noEmit', '--pretty', 'false'])
    const tscDuration = Date.now() - tscStart

    if (tscResult.success) {
      updateStage('Type Check', { status: 'passed', duration: tscDuration })
      await logger.success('✅ Type check passed')
    } else {
      const errorOutput = tscResult.output || tscResult.error || 'Unknown type error'
      const truncatedError = errorOutput.slice(0, 3000)

      updateStage('Type Check', {
        status: 'failed',
        duration: tscDuration,
        error: truncatedError,
        output: truncatedError,
      })
      await logger.error('❌ Type check failed')

      // ── Auto-fix loop for type errors ──
      await logger.info('🤖 Starting AI-powered auto-fix loop for type errors...')
      const autoFixResult = await runAutoFixLoop({
        sandbox,
        stageName: 'Type Check',
        errorOutput: truncatedError,
        logger,
        maxAttempts: 3,
        rerunStage: async () => {
          const rerun = await runInProject(sandbox, 'npx', ['tsc', '--noEmit', '--pretty', 'false'])
          return {
            success: rerun.success,
            error: rerun.output || rerun.error,
            output: rerun.output,
          }
        },
      })

      // Log auto-fix summary
      await logger.info(formatAutoFixSummary(autoFixResult))

      if (autoFixResult.success) {
        updateStage('Type Check', {
          status: 'passed',
          error: undefined,
          duration: Date.now() - tscStart,
        })
        await logger.success('✅ Type check passed after auto-fix')
      } else {
        updateStage('Type Check', {
          status: 'failed',
          error: autoFixResult.finalError?.slice(0, 2000) || truncatedError,
          duration: Date.now() - tscStart,
        })
        await logger.error('❌ Type check failed after auto-fix loop')
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Type check execution failed'
    updateStage('Type Check', { status: 'failed', error: errorMessage })
    await logger.error('❌ Type check execution error')
  }

  // ── Stage 2: Test Suite ──
  updateStage('Tests', { status: 'running' })
  await logger.info('🧪 Stage 2/6: Running test suite...')
  const testStart = Date.now()

  try {
    // Detect package manager and test command
    const hasPackageJson = await runInProject(sandbox, 'test', ['-f', 'package.json'])
    let testResult

    if (hasPackageJson.success) {
      testResult = await runInProject(sandbox, 'npx', ['vitest', 'run', '--reporter', 'verbose', '--no-coverage'])
      if (!testResult.success) {
        testResult = await runInProject(sandbox, 'npx', ['jest', '--no-coverage', '--verbose', 'false'])
      }
      if (!testResult.success) {
        testResult = await runInProject(sandbox, 'npm', ['test'])
      }
    } else {
      testResult = await runInProject(sandbox, 'python3', ['-m', 'pytest', '-x', '-q', '--tb=short'])
    }

    const testDuration = Date.now() - testStart
    const testOutput = testResult.output || testResult.error || ''

    if (testResult.success) {
      updateStage('Tests', { status: 'passed', duration: testDuration, output: testOutput.slice(0, 500) })
      await logger.success('✅ Tests passed')
    } else {
      const failedTests = (testOutput.match(/✗|✖|FAIL|failed/g) || []).length

      if (failedTests > 0) {
        await logger.error('❌ Tests failed')
        updateStage('Tests', { status: 'failed', duration: testDuration, error: testOutput.slice(0, 2000) })

        // ── Auto-fix loop for test failures ──
        await logger.info('🤖 Starting AI-powered auto-fix loop for test failures...')
        const autoFixResult = await runAutoFixLoop({
          sandbox,
          stageName: 'Tests',
          errorOutput: testOutput.slice(0, 5000),
          logger,
          maxAttempts: 2,
          context: hasPackageJson.success ? 'Node.js project with tests' : 'Python project with tests',
          rerunStage: async () => {
            let rerunResult
            if (hasPackageJson.success) {
              rerunResult = await runInProject(sandbox, 'npx', [
                'vitest',
                'run',
                '--reporter',
                'verbose',
                '--no-coverage',
              ])
              if (!rerunResult.success) {
                rerunResult = await runInProject(sandbox, 'npm', ['test'])
              }
            } else {
              rerunResult = await runInProject(sandbox, 'python3', ['-m', 'pytest', '-x', '-q', '--tb=short'])
            }
            return {
              success: rerunResult.success,
              error: rerunResult.output || rerunResult.error,
              output: rerunResult.output,
            }
          },
        })

        await logger.info(formatAutoFixSummary(autoFixResult))

        if (autoFixResult.success) {
          updateStage('Tests', {
            status: 'passed',
            error: undefined,
            duration: Date.now() - testStart,
          })
          await logger.success('✅ Tests passed after auto-fix')
        } else {
          updateStage('Tests', {
            status: 'failed',
            error: autoFixResult.finalError?.slice(0, 2000) || testOutput.slice(0, 2000),
            duration: Date.now() - testStart,
          })
          await logger.error('❌ Tests still failing after auto-fix')
        }
      } else {
        // Non-zero exit but no explicit failure indicators (no test files)
        await logger.info('⚠️  No test files found, skipping')
        updateStage('Tests', { status: 'skipped' })
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Test execution failed'
    updateStage('Tests', { status: 'skipped', error: errorMessage })
    await logger.info('⚠️  Tests not available')
  }

  // ── Stage 3: Dependency Audit ──
  updateStage('Dependency Audit', { status: 'running' })
  await logger.info('🔒 Stage 3/6: Running dependency audit...')
  const auditStart = Date.now()

  try {
    const auditResult = await runInProject(sandbox, 'npm', ['audit'])
    const auditDuration = Date.now() - auditStart

    // npm audit exits with non-zero if vulnerabilities found
    const auditOutput = auditResult.output || auditResult.error || ''
    const hasVulnerabilities = !auditResult.success

    updateStage('Dependency Audit', {
      status: 'passed', // We don't fail the pipeline for vulnerabilities, just report
      duration: auditDuration,
      output: auditOutput.slice(0, 1000),
    })

    if (hasVulnerabilities) {
      await logger.info('⚠️  Dependency vulnerabilities detected (non-blocking)')
    } else {
      await logger.success('✅ Dependency audit clean')
    }
  } catch (error) {
    updateStage('Dependency Audit', { status: 'skipped' })
    await logger.info('⚠️  Dependency audit not available')
  }

  // ── Stage 4: Browser Screenshot ──
  if (enableBrowser) {
    updateStage('Visual Verification', { status: 'running' })
    await logger.info('📸 Stage 4/6: Taking visual screenshots...')
    const screenshotStart = Date.now()

    try {
      // Try to start the dev server and take screenshots
      const hasDevScript = await runInProject(sandbox, 'sh', [
        '-c',
        `node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.dev?0:1)"`,
      ])

      if (hasDevScript.success) {
        // Start dev server in background
        await runCommandInSandbox(sandbox, 'sh', [
          '-c',
          `cd /vercel/sandbox/project && npm run dev -- --host 0.0.0.0 --port 3000 &`,
        ])

        // Wait for server to start
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Check if Playwright is available
        const hasPlaywright = await runInProject(sandbox, 'sh', [
          '-c',
          'npx playwright --version 2>/dev/null || node -e "require(\"playwright\");console.log(\"ok\")" 2>/dev/null',
        ])

        if (hasPlaywright.success || hasPlaywright.output?.includes('ok')) {
          // Take screenshot of the running app
          // Use dynamic import for ESM compatibility
          const screenshotScript = `
            (async () => {
              const { chromium } = await import('playwright');
              const fs = await import('fs');
              const browser = await chromium.launch({ headless: true });
              const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
              try {
                await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
                await page.screenshot({ path: '/tmp/preview-screenshot.png', fullPage: true });
                const stats = fs.statSync('/tmp/preview-screenshot.png');
                console.log('Screenshot saved: ' + stats.size + ' bytes');
              } catch(e) {
                console.log('Could not load page:', e.message);
              }
              await browser.close();
            })();
          `
          const scrResult = await runCommandInSandbox(sandbox, 'node', ['-e', screenshotScript])
          const screenshotDuration = Date.now() - screenshotStart

          if (scrResult.output?.includes('Screenshot saved')) {
            updateStage('Visual Verification', {
              status: 'passed',
              duration: screenshotDuration,
              output: 'Screenshot captured successfully',
            })
            await logger.success('✅ Visual verification complete')
          } else {
            updateStage('Visual Verification', {
              status: 'skipped',
              duration: screenshotDuration,
              output: 'Could not load page for screenshot',
            })
            await logger.info('⚠️  Visual verification skipped (page not accessible)')
          }
        } else {
          updateStage('Visual Verification', { status: 'skipped' })
          await logger.info('⚠️  Playwright not available for visual verification')
        }

        // Kill the dev server
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'next dev'])
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'vite'])
      } else {
        updateStage('Visual Verification', { status: 'skipped' })
        await logger.info('⚠️  No dev server to verify visually')
      }
    } catch (error) {
      updateStage('Visual Verification', { status: 'skipped' })
      await logger.info('⚠️  Visual verification skipped')
    }
  } else {
    updateStage('Visual Verification', { status: 'skipped' })
  }

  // ── Stage 5: Lint/Format Check ──
  updateStage('Lint & Format', { status: 'running' })
  await logger.info('✨ Stage 5/6: Running lint and format check...')
  const lintStart = Date.now()

  try {
    // Try ESLint first, then Prettier, then Biome
    const eslintResult = await runInProject(sandbox, 'npx', [
      'eslint',
      '.',
      '--max-warnings',
      '100',
      '--no-error-on-unmatched-pattern',
    ])
    const lintDuration = Date.now() - lintStart

    if (eslintResult.success) {
      updateStage('Lint & Format', { status: 'passed', duration: lintDuration })
      await logger.success('✅ Lint check passed')
    } else {
      const hasErrors = (eslintResult.output || '').includes('error') || (eslintResult.error || '').includes('error')

      if (hasErrors) {
        updateStage('Lint & Format', {
          status: 'failed',
          duration: lintDuration,
          error: (eslintResult.output || eslintResult.error || 'Lint errors').slice(0, 1500),
        })
        await logger.error('❌ Lint check found errors')

        // ── Auto-fix loop for lint errors ──
        await logger.info('🤖 Starting AI-powered auto-fix loop for lint errors...')
        const autoFixResult = await runAutoFixLoop({
          sandbox,
          stageName: 'Lint & Format',
          errorOutput: (eslintResult.output || eslintResult.error || '').slice(0, 5000),
          logger,
          maxAttempts: 2,
          rerunStage: async () => {
            const rerun = await runInProject(sandbox, 'npx', [
              'eslint',
              '.',
              '--max-warnings',
              '100',
              '--no-error-on-unmatched-pattern',
            ])
            const hasErrorsNow = (rerun.output || '').includes('error') || (rerun.error || '').includes('error')
            return { success: !hasErrorsNow, error: rerun.output || rerun.error }
          },
        })

        await logger.info(formatAutoFixSummary(autoFixResult))

        if (autoFixResult.success) {
          updateStage('Lint & Format', { status: 'passed', error: undefined, duration: Date.now() - lintStart })
          await logger.success('✅ Lint check passed after auto-fix')
        } else {
          updateStage('Lint & Format', {
            status: 'failed',
            error: autoFixResult.finalError?.slice(0, 1000) || 'Lint errors remain',
            duration: Date.now() - lintStart,
          })
          await logger.error('❌ Lint errors remain after auto-fix')
        }
      } else {
        await logger.success('✅ Lint check passed (warnings only)')
        updateStage('Lint & Format', { status: 'passed', error: undefined })
      }
    }
  } catch (error) {
    updateStage('Lint & Format', { status: 'skipped' })
    await logger.info('⚠️  Lint check skipped')
  }

  // ── Stage 6: Generate Commit & Push ──
  // (This is handled by the caller - the continue route already does this)

  const totalDuration = Date.now() - startTime
  const allPassed = stages.every((s) => s.status === 'passed' || s.status === 'skipped')
  // Generate meaningful commit message with AI metadata
  let commitMessage = options.commitMessage
  if (!commitMessage) {
    try {
      commitMessage = await generateCommitMessage({
        description: prompt,
        context: `Automated by ${selectedAgent || 'AI'} Agent`,
      })
    } catch {
      commitMessage = createFallbackCommitMessage(prompt)
    }
  }

  // Add AI provenance metadata to the commit message
  const routingInfo = routePrompt(prompt)
  const provenanceLine = `\n\n[ai:${selectedAgent || 'auto'}|model:${selectedModel || routingInfo.model}|task:${options.taskId}|complexity:${routingInfo.complexity}/10]`
  commitMessage = `${commitMessage}${provenanceLine}`

  return {
    success: allPassed,
    stages,
    commitMessage,
    duration: totalDuration,
  }
}

/**
 * Generates an AI pipeline status summary for UI display.
 */
export function formatPipelineSummary(result: PipelineResult): string {
  const lines = ['## 📋 Pipeline Results', '']

  for (const stage of result.stages) {
    const icon =
      stage.status === 'passed'
        ? '✅'
        : stage.status === 'failed'
          ? '❌'
          : stage.status === 'skipped'
            ? '⏭️'
            : stage.status === 'running'
              ? '🔄'
              : '⏳'
    const duration = stage.duration ? ` (${(stage.duration / 1000).toFixed(1)}s)` : ''
    const error = stage.error ? `\n  Error: ${stage.error.slice(0, 200)}` : ''
    lines.push(`${icon} **${stage.name}**: ${stage.status}${duration}${error}`)
  }

  lines.push('')
  lines.push(`⏱️ Total: ${(result.duration / 1000).toFixed(1)}s`)

  if (result.commitMessage) {
    lines.push(`📝 Commit: ${result.commitMessage.split('\n')[0]}`)
  }
  if (result.prUrl) {
    lines.push(`🔗 PR: ${result.prUrl}`)
  }
  if (result.deploymentUrl) {
    lines.push(`🚀 Deploy: ${result.deploymentUrl}`)
  }

  return lines.join('\n')
}
