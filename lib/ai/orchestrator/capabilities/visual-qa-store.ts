import { db } from '@/lib/db/client'
import { visualQaRuns } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

export type VisualQaVerdict = 'pass' | 'fail' | 'unknown'

export interface SaveVisualQaRunInput {
  taskId: string
  userId: string
  url: string
  prompt: string
  verdict: VisualQaVerdict
  critique: string
  screenshotBase64: string
}

/**
 * Persist a visual QA run (screenshot + critique + verdict) so the task UI can
 * show the result and full history. Best-effort: a DB failure never breaks the
 * tool execution itself.
 */
export async function saveVisualQaRun(input: SaveVisualQaRunInput): Promise<void> {
  try {
    await db.insert(visualQaRuns).values({
      id: generateId(12),
      taskId: input.taskId,
      userId: input.userId,
      url: input.url,
      prompt: input.prompt,
      verdict: input.verdict,
      critique: input.critique,
      screenshotBase64: input.screenshotBase64,
    })
  } catch (error) {
    console.error('Failed to save visual QA run')
  }
}
