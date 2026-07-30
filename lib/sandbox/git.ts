import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject } from './commands'
import { TaskLogger } from '@/lib/utils/task-logger'
import { runVerificationPipeline, formatPipelineSummary, type PipelineResult } from './pipeline'

/**
 * Check if the pipeline applies to this task.
 * For now, run it always unless explicitly disabled.
 */
function shouldRunPipeline(): boolean {
  return process.env.DISABLE_AUTO_PIPELINE !== 'true'
}

export async function pushChangesToBranch(
  sandbox: Sandbox,
  branchName: string,
  commitMessage: string,
  logger: TaskLogger,
  options?: {
    taskId?: string
    repoUrl?: string
    selectedAgent?: string
    selectedModel?: string
    prompt?: string
    enableBrowser?: boolean
    skipPipeline?: boolean
  },
): Promise<{ success: boolean; pushFailed?: boolean; pipeline?: PipelineResult }> {
  try {
    // ── Run the verification pipeline before committing ──
    let pipeline: PipelineResult | undefined

    if (shouldRunPipeline() && !options?.skipPipeline && options?.taskId && sandbox) {
      await logger.info('🚀 Running verification pipeline...')

      pipeline = await runVerificationPipeline({
        sandbox,
        taskId: options.taskId,
        branchName,
        repoUrl: options.repoUrl || '',
        selectedAgent: options.selectedAgent,
        selectedModel: options.selectedModel,
        prompt: options.prompt || commitMessage,
        enableBrowser: options.enableBrowser,
        logger,
      })

      // Log pipeline summary
      const summary = formatPipelineSummary(pipeline)
      await logger.info(summary)

      // Use pipeline-generated commit message with provenance
      if (pipeline.commitMessage) {
        commitMessage = pipeline.commitMessage
      }
    }

    // ── Check if there are any changes to commit ──
    const statusResult = await runInProject(sandbox, 'git', ['status', '--porcelain'])

    if (!statusResult.output?.trim()) {
      await logger.info('No changes to commit')
      return { success: true, pipeline }
    }

    await logger.info('Changes detected, committing...')

    // Add all changes
    const addResult = await runInProject(sandbox, 'git', ['add', '.'])
    if (!addResult.success) {
      await logger.info('Failed to add changes')
      if (addResult.error) {
        console.error('Git add error details:', addResult.error)
        await logger.error('Action logged')
      }
      return { success: false, pipeline }
    }

    // Commit changes
    const commitResult = await runInProject(sandbox, 'git', ['commit', '-m', commitMessage])

    if (!commitResult.success) {
      await logger.info('Failed to commit changes')
      if (commitResult.error) {
        console.error('Commit error details:', commitResult.error)
        await logger.error('Action logged')
      }
      return { success: false, pipeline }
    }

    await logger.info('Changes committed successfully')

    // Push to remote branch
    const pushResult = await runInProject(sandbox, 'git', ['push', 'origin', branchName])

    if (pushResult.success) {
      await logger.info('Successfully pushed changes to branch')
      return { success: true, pipeline }
    } else {
      const errorMsg = pushResult.error || 'Unknown error'
      await logger.info('Failed to push to branch')

      // Check if it's a permission issue
      if (errorMsg.includes('Permission') || errorMsg.includes('access_denied') || errorMsg.includes('403')) {
        await logger.info(
          'Note: This appears to be a permission issue. The changes were committed locally but could not be pushed.',
        )
        await logger.info('You may need to check repository permissions or authentication tokens.')
      }

      // Still return success since the work was completed, just couldn't push
      return { success: true, pushFailed: true, pipeline }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    await logger.info('Error pushing changes')
    return { success: false }
  }
}

export async function shutdownSandbox(sandbox?: Sandbox): Promise<{ success: boolean; error?: string }> {
  try {
    // If we have a sandbox reference, try to kill any running processes
    if (sandbox) {
      try {
        // Try to kill any long-running processes that might be active
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'node'])
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'python'])
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'npm'])
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'yarn'])
        await runCommandInSandbox(sandbox, 'pkill', ['-f', 'pnpm'])
      } catch {
        // Best effort - don't fail if we can't kill processes
        console.log('Best effort process cleanup completed')
      }
    }

    // Note: Vercel Sandbox automatically shuts down after timeout
    // No explicit shutdown method available in current SDK
    // The sandbox will be garbage collected and shut down automatically
    return { success: true }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to shutdown sandbox'
    return { success: false, error: errorMessage }
  }
}
