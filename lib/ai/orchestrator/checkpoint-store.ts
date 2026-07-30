/**
 * Checkpoint Store — tracks codebase snapshots at key milestones.
 *
 * Like Devin's checkpoint system and Cursor's diff review:
 * - Saves file states before each major change
 * - Supports accept/reject per checkpoint
 * - Enables rollback to any previous state
 * - Shows what changed between checkpoints
 */

import { db } from '@/lib/db/client'
import { checkpoints } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { SandboxBridge } from '@/lib/ai/orchestrator/runtime/sandbox-bridge'

export interface CheckpointEntry {
  id: string
  taskId: string
  label: string
  description: string
  timestamp: Date
  status: 'active' | 'accepted' | 'rejected' | 'rolled_back'
  fileStates: Record<string, string>
  metadata?: {
    agent?: string
    model?: string
    stage?: string
    prompt?: string
  }
}

export interface CheckpointDiff {
  checkpoint: CheckpointEntry
  previousCheckpoint?: CheckpointEntry
  changedFiles: string[]
  addedFiles: string[]
  deletedFiles: string[]
  diffs: Record<string, { oldContent: string; newContent: string }>
}

/**
 * Creates a checkpoint by saving the current state of all tracked files.
 */
export async function createCheckpoint(
  taskId: string,
  label: string,
  description: string,
  options?: {
    files?: string[]
    metadata?: CheckpointEntry['metadata']
    bridge?: SandboxBridge
  },
): Promise<CheckpointEntry> {
  const id = `ck-${generateId(12)}`
  const fileStates: Record<string, string> = {}

  // Save file states from sandbox if available
  if (options?.bridge && options?.bridge.isAvailable()) {
    const filesToSnapshot = options.files || []

    for (const filePath of filesToSnapshot) {
      try {
        const content = await options.bridge.readFile(filePath)
        if (content) {
          fileStates[filePath] = content
        }
      } catch {
        // File might not exist yet (new file)
        fileStates[filePath] = ''
      }
    }
  }

  const entry: CheckpointEntry = {
    id,
    taskId,
    label,
    description,
    timestamp: new Date(),
    status: 'active',
    fileStates,
    metadata: options?.metadata,
  }

  // Save to database
  try {
    await db.insert(checkpoints).values({
      id,
      taskId,
      label,
      description,
      fileStates,
      metadata: options?.metadata || null,
      status: 'active',
    })
  } catch (error) {
    console.error('Failed to save checkpoint to database')
    // Continue anyway - the in-memory checkpoint is still valid
  }

  return entry
}

/**
 * Gets all checkpoints for a task, ordered by creation time.
 */
export async function getTaskCheckpoints(taskId: string): Promise<CheckpointEntry[]> {
  try {
    const rows = await db
      .select()
      .from(checkpoints)
      .where(eq(checkpoints.taskId, taskId))
      .orderBy(desc(checkpoints.createdAt))

    return rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      label: row.label,
      description: row.description || '',
      timestamp: row.createdAt,
      status: row.status as CheckpointEntry['status'],
      fileStates: typeof row.fileStates === 'string' ? JSON.parse(row.fileStates) : row.fileStates,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
    }))
  } catch (error) {
    console.error('Failed to fetch checkpoints')
    return []
  }
}

/**
 * Gets the diff between two consecutive checkpoints.
 */
export async function getCheckpointDiff(taskId: string, checkpointId?: string): Promise<CheckpointDiff | null> {
  const allCheckpoints = await getTaskCheckpoints(taskId)
  if (allCheckpoints.length === 0) return null

  let currentCk: CheckpointEntry
  let previousCk: CheckpointEntry | undefined

  if (checkpointId) {
    currentCk = allCheckpoints.find((c) => c.id === checkpointId)!
    if (!currentCk) return null
    const currentIndex = allCheckpoints.indexOf(currentCk)
    previousCk = currentIndex < allCheckpoints.length - 1 ? allCheckpoints[currentIndex + 1] : undefined
  } else {
    currentCk = allCheckpoints[0]
    previousCk = allCheckpoints[1]
  }

  // Compute diffs
  const changedFiles: string[] = []
  const addedFiles: string[] = []
  const deletedFiles: string[] = []
  const diffs: Record<string, { oldContent: string; newContent: string }> = {}

  const prevFiles = previousCk?.fileStates || {}
  const currFiles = currentCk.fileStates

  // Find changed and added files
  for (const [filePath, content] of Object.entries(currFiles)) {
    if (prevFiles[filePath] === undefined) {
      addedFiles.push(filePath)
      diffs[filePath] = { oldContent: '', newContent: content }
    } else if (prevFiles[filePath] !== content) {
      changedFiles.push(filePath)
      diffs[filePath] = { oldContent: prevFiles[filePath], newContent: content }
    }
  }

  // Find deleted files
  for (const filePath of Object.keys(prevFiles)) {
    if (currFiles[filePath] === undefined) {
      deletedFiles.push(filePath)
      diffs[filePath] = { oldContent: prevFiles[filePath], newContent: '' }
    }
  }

  return {
    checkpoint: currentCk,
    previousCheckpoint: previousCk,
    changedFiles,
    addedFiles,
    deletedFiles,
    diffs,
  }
}

/**
 * Updates a checkpoint's status (accept/reject/rollback).
 */
export async function updateCheckpointStatus(checkpointId: string, status: CheckpointEntry['status']): Promise<void> {
  try {
    await db.update(checkpoints).set({ status }).where(eq(checkpoints.id, checkpointId))
  } catch (error) {
    console.error('Failed to update checkpoint status')
  }
}

/**
 * Generates a checkpoint summary for display in the UI.
 */
export function formatCheckpointSummary(diff: CheckpointDiff): string {
  const lines: string[] = []
  const { checkpoint } = diff

  lines.push(`📌 **${checkpoint.label}**`)
  lines.push(`   ${checkpoint.description}`)
  lines.push(`   Status: ${checkpoint.status}`)
  if (checkpoint.metadata?.stage) {
    lines.push(`   Stage: ${checkpoint.metadata.stage}`)
  }

  if (diff.changedFiles.length > 0 || diff.addedFiles.length > 0 || diff.deletedFiles.length > 0) {
    lines.push('')
    lines.push('📄 Changes:')

    for (const filePath of diff.changedFiles) {
      const oldLen = diff.diffs[filePath]?.oldContent.length || 0
      const newLen = diff.diffs[filePath]?.newContent.length || 0
      lines.push(`   ✏️ ${filePath} (${oldLen} → ${newLen} chars)`)
    }

    for (const filePath of diff.addedFiles) {
      lines.push(`   ➕ ${filePath}`)
    }

    for (const filePath of diff.deletedFiles) {
      lines.push(`   ➖ ${filePath}`)
    }
  }

  return lines.join('\n')
}
