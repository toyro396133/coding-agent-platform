import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema } from '@/lib/db/schema'
import { eq, desc, asc, and, isNull, or, inArray } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { getReadableTaskError } from '@/lib/api/job-errors'
import type { OrchestratorState } from './state'

// ─── Query helpers ─────────────────────────────────────────────────────

/** Get all active tasks (not deleted) for a user */
async function getUserActiveTasks(userId: string) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      prompt: tasks.prompt,
      status: tasks.status,
      progress: tasks.progress,
      selectedAgent: tasks.selectedAgent,
      selectedModel: tasks.selectedModel,
      repoUrl: tasks.repoUrl,
      branchName: tasks.branchName,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
      error: tasks.error,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.createdAt))
}

/** Get active tasks by status */
async function getTasksByStatus(userId: string, status: string) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      prompt: tasks.prompt,
      status: tasks.status,
      progress: tasks.progress,
      selectedAgent: tasks.selectedAgent,
      selectedModel: tasks.selectedModel,
      repoUrl: tasks.repoUrl,
      branchName: tasks.branchName,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
      error: tasks.error,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(
          tasks.status,
          status as 'pending' | 'processing' | 'completed' | 'error' | 'stopped' | 'PLANNING_PENDING_APPROVAL',
        ),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(desc(tasks.createdAt))
}

// ─── Orchestrator Task Queue Tools ─────────────────────────────────────

export function createTaskQueueTools(state: OrchestratorState) {
  const userId = state.userId
  if (!userId) {
    throw new Error('OrchestratorState must have userId set for task queue tools')
  }

  return {
    listTasks: tool({
      description: `List all tasks in the user's queue with their current status. Use this to see what work is pending, what's in progress, and what's completed. Filter by status: 'all' (default), 'pending', 'processing', 'completed', 'error', 'stopped'.
      
The task queue is YOUR responsibility as the main agent. You can:
- View all tasks and their status
- Decide which task to work on next
- Create new sub-tasks to break down complex work
- Reorder tasks by priority
- Edit task descriptions and parameters
- Mark tasks for deletion when they're no longer needed`,
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .default('all')
          .describe("Filter by status: 'all', 'pending', 'processing', 'completed', 'error', 'stopped'"),
      }),
      execute: async ({ status }: { status?: string }) => {
        let results
        if (status && status !== 'all') {
          results = await getTasksByStatus(userId, status)
        } else {
          results = await getUserActiveTasks(userId)
        }

        if (results.length === 0) {
          return '📋 **Task Queue:** No tasks found.'
        }

        const lines = ['📋 **Task Queue:**', '', `Total: ${results.length} tasks`, '']
        for (let i = 0; i < results.length; i++) {
          const t = results[i]
          const statusIcon =
            t.status === 'completed'
              ? '✅'
              : t.status === 'error'
                ? '❌'
                : t.status === 'processing'
                  ? '🔄'
                  : t.status === 'stopped'
                    ? '⏹️'
                    : '⏳'
          const title = t.title || t.prompt.substring(0, 80) + (t.prompt.length > 80 ? '...' : '')
          const progress = t.progress ? ` (${t.progress}%)` : ''
          lines.push(`${i + 1}. ${statusIcon} **${title}**`)
          lines.push(`   ID: \`${t.id}\` | Status: ${t.status}${progress} | Agent: ${t.selectedAgent || 'auto'}`)
          if (t.repoUrl) lines.push(`   Repo: ${t.repoUrl}`)
          if (t.createdAt) lines.push(`   Created: ${t.createdAt.toLocaleString()}`)
          if (t.error) lines.push(`   Error: ${getReadableTaskError(t.error)}`)
          lines.push('')
        }

        // Store the task list in state so orchestrator can reference it
        state.appendContext(`Current task queue: ${results.length} tasks`)
        return lines.join('\n')
      },
    }),

    createTask: tool({
      description: `Create a new task in the queue. The new task will start in 'pending' status.
Use this to break down complex work into manageable pieces, create sub-tasks, or queue up follow-up work.
The task will be added with status 'pending' and can be executed later.`,
      inputSchema: z.object({
        prompt: z.string().describe('The task description/prompt'),
        title: z.string().optional().describe('Optional short title for the task'),
        repoUrl: z.string().optional().describe('Repository URL if this task targets a specific repo'),
        selectedAgent: z
          .string()
          .optional()
          .default('claude')
          .describe('Agent to use: claude, codex, cursor, gemini, copilot, opencode'),
        selectedModel: z.string().optional().describe('Model to use (e.g. claude-sonnet-4-5, gpt-4o)'),
        priority: z.number().optional().describe('Priority order (lower = earlier execution)'),
      }),
      execute: async ({
        prompt,
        title,
        repoUrl,
        selectedAgent,
        selectedModel,
      }: {
        prompt: string
        title?: string
        repoUrl?: string
        selectedAgent?: string
        selectedModel?: string
      }) => {
        const taskId = generateId(12)
        await db.insert(tasks).values({
          id: taskId,
          userId,
          prompt,
          title: title || null,
          repoUrl: repoUrl || null,
          selectedAgent: selectedAgent || 'claude',
          selectedModel: selectedModel || null,
          status: 'pending',
          progress: 0,
          logs: [],
        })

        // Add to orchestrator context
        state.appendContext(`Created new task: ${title || prompt.substring(0, 60)}`)
        state.addSubAgentResult(
          'task_creation',
          `Created task: ${title || prompt.substring(0, 60)}`,
          `Task ID: ${taskId}`,
        )

        return `✅ **Task created successfully**
- ID: \`${taskId}\`
- Title: ${title || '(auto)'}
- Prompt: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}
- Agent: ${selectedAgent || 'claude'}
- Status: pending

The task is now in the queue and ready for execution.`
      },
    }),

    editTask: tool({
      description: `Edit an existing task's properties. Use this to update the prompt, title, agent, model, or repo URL. Any fields you provide will overwrite the existing values.`,
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the task to edit'),
        prompt: z.string().optional().describe('New prompt/description'),
        title: z.string().optional().describe('New title'),
        repoUrl: z.string().optional().describe('New repository URL'),
        selectedAgent: z.string().optional().describe('New agent type'),
        selectedModel: z.string().optional().describe('New model'),
      }),
      execute: async (updates: {
        taskId: string
        prompt?: string
        title?: string
        repoUrl?: string
        selectedAgent?: string
        selectedModel?: string
      }) => {
        const { taskId, ...fields } = updates

        // Verify task exists and belongs to user
        const [existing] = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
          .limit(1)

        if (!existing) {
          return `❌ Task \`${taskId}\` not found. Use listTasks to see available tasks.`
        }

        // Build update object with only provided fields
        const updateData: Record<string, unknown> = { updatedAt: new Date() }
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            updateData[key] = value
          }
        }

        await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))
        state.appendContext(`Edited task: ${taskId}`)

        return `✅ **Task updated**: \`${taskId}\``
      },
    }),

    deleteTask: tool({
      description: `Soft-delete a task from the queue. The task is marked as deleted but not permanently removed. Use this to remove tasks that are no longer needed.`,
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the task to delete'),
        reason: z.string().optional().describe('Optional reason for deletion'),
      }),
      execute: async ({ taskId, reason }: { taskId: string; reason?: string }) => {
        // Verify task exists and belongs to user
        const [existing] = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
          .limit(1)

        if (!existing) {
          return `❌ Task \`${taskId}\` not found.`
        }

        await db
          .update(tasks)
          .set({ deletedAt: new Date(), updatedAt: new Date(), status: 'stopped' })
          .where(eq(tasks.id, taskId))

        const reasonText = reason ? ` Reason: ${reason}` : ''
        state.appendContext(`Deleted task: ${taskId}${reasonText}`)

        return `✅ **Task deleted**: \`${taskId}\`${reasonText}`
      },
    }),

    getTaskStatus: tool({
      description: `Get detailed status of a specific task by ID. Shows full prompt, progress, logs, and any error messages.`,
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the task to check'),
      }),
      execute: async ({ taskId }: { taskId: string }) => {
        const [task] = await db
          .select({
            id: tasks.id,
            title: tasks.title,
            prompt: tasks.prompt,
            status: tasks.status,
            progress: tasks.progress,
            selectedAgent: tasks.selectedAgent,
            selectedModel: tasks.selectedModel,
            repoUrl: tasks.repoUrl,
            branchName: tasks.branchName,
            sandboxUrl: tasks.sandboxUrl,
            previewUrl: tasks.previewUrl,
            prUrl: tasks.prUrl,
            prStatus: tasks.prStatus,
            error: tasks.error,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
            completedAt: tasks.completedAt,
            executionMode: tasks.executionMode,
            executionLevel: tasks.executionLevel,
          })
          .from(tasks)
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
          .limit(1)

        if (!task) {
          return `❌ Task \`${taskId}\` not found.`
        }

        const statusIcon =
          task.status === 'completed'
            ? '✅'
            : task.status === 'error'
              ? '❌'
              : task.status === 'processing'
                ? '🔄'
                : task.status === 'stopped'
                  ? '⏹️'
                  : '⏳'

        const lines = [
          `${statusIcon} **Task: ${task.title || task.prompt.substring(0, 80)}**`,
          '',
          `- ID: \`${task.id}\``,
          `- Status: ${task.status}${task.progress ? ` (${task.progress}%)` : ''}`,
          `- Agent: ${task.selectedAgent || 'auto'}${task.selectedModel ? ` / ${task.selectedModel}` : ''}`,
        ]

        if (task.repoUrl) lines.push(`- Repo: ${task.repoUrl}`)
        if (task.branchName) lines.push(`- Branch: ${task.branchName}`)
        if (task.sandboxUrl) lines.push(`- Sandbox: ${task.sandboxUrl}`)
        if (task.previewUrl) lines.push(`- Preview: ${task.previewUrl}`)
        if (task.prUrl) lines.push(`- PR: ${task.prUrl} (${task.prStatus || 'unknown'})`)
        if (task.executionMode) lines.push(`- Mode: ${task.executionMode}`)
        if (task.error) lines.push(`- Error: ${getReadableTaskError(task.error)}`)
        if (task.createdAt) lines.push(`- Created: ${task.createdAt.toLocaleString()}`)
        if (task.completedAt) lines.push(`- Completed: ${task.completedAt.toLocaleString()}`)

        lines.push('')
        lines.push('**Prompt:**')
        lines.push(task.prompt.substring(0, 1000) + (task.prompt.length > 1000 ? '...' : ''))

        return lines.join('\n')
      },
    }),

    analyzeTaskQueue: tool({
      description: `Analyze all pending tasks and recommend the optimal execution order based on dependencies, complexity, and resource usage. Use this when you have multiple tasks queued and want to plan the most efficient execution strategy.`,
      inputSchema: z.object({
        userId: z.string().optional().describe('User ID (defaults to current user)'),
      }),
      execute: async () => {
        const allTasks = await getUserActiveTasks(userId)
        const pending = allTasks.filter((t) => t.status === 'pending')
        const inProgress = allTasks.filter((t) => t.status === 'processing')
        const completed = allTasks.filter((t) => t.status === 'completed')

        if (pending.length === 0) {
          return '📊 **Queue Analysis:** No pending tasks to analyze.'
        }

        const lines = [
          '📊 **Task Queue Analysis**',
          '',
          `📊 ${allTasks.length} total | ⏳ ${pending.length} pending | 🔄 ${inProgress.length} in progress | ✅ ${completed.length} completed`,
          '',
        ]

        if (inProgress.length > 0) {
          lines.push('**Currently in progress:**')
          for (const t of inProgress) {
            lines.push(`- 🔄 ${t.title || t.prompt.substring(0, 60)} (\`${t.id}\`)`)
          }
          lines.push('')
        }

        if (pending.length > 0) {
          lines.push('**Recommended execution order:**')
          const sorted = [...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          sorted.forEach((t, i) => {
            lines.push(
              `${i + 1}. ${t.title || t.prompt.substring(0, 60)}${t.repoUrl ? ` (${t.repoUrl.split('/').pop()})` : ''}`,
            )
          })

          lines.push('')
          lines.push('**Recommendation:**')
          if (sorted.length === 1) {
            lines.push('Only one pending task — proceed with execution when ready.')
          } else {
            lines.push(
              `Execute in FIFO order (${sorted.length} tasks). Consider creating sub-tasks for complex items that can be parallelized.`,
            )
          }
        }

        return lines.join('\n')
      },
    }),
  }
}

// ─── Build task queue awareness section for system prompt ─────────────

export async function buildTaskQueueAwareness(userId: string): Promise<string> {
  try {
    const queuedTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        prompt: tasks.prompt,
        status: tasks.status,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          or(eq(tasks.status, 'pending'), eq(tasks.status, 'processing')),
        ),
      )
      .orderBy(asc(tasks.createdAt))

    if (queuedTasks.length === 0) return ''

    let awarenessText = '\n\n## 📋 Current Task Queue\n\n'
    awarenessText += `You have **${queuedTasks.length} task(s)** in your queue:\n\n`

    for (let i = 0; i < queuedTasks.length; i++) {
      const t = queuedTasks[i]
      const isCurrent = t.status === 'processing'
      const prefix = isCurrent ? '👉 **CURRENT**' : `**${i + 1}.**`
      const title = t.title || t.prompt.substring(0, 100) + (t.prompt.length > 100 ? '...' : '')
      awarenessText += `${prefix} ${title} (\`${t.id}\`)\n`
    }

    awarenessText += '\nYou can manage the queue using the task queue tools:\n'
    awarenessText += '- `listTasks` — View all tasks\n'
    awarenessText += '- `createTask` — Add new tasks\n'
    awarenessText += '- `editTask` — Modify task properties\n'
    awarenessText += '- `deleteTask` — Remove completed/unwanted tasks\n'
    awarenessText += '- `analyzeTaskQueue` — Get optimal execution order\n'

    return awarenessText
  } catch {
    return ''
  }
}
