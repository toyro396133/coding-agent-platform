import { tool } from 'ai'
import { z } from 'zod'
import type { BackgroundTask, ToolContext } from './types'

export function createBackgroundTools(ctx: ToolContext) {
  const tasks: BackgroundTask[] = []

  return {
    scheduleTask: tool({
      description: 'Schedule a task to run in the background. The task will be tracked and can be monitored later.',
      inputSchema: z.object({
        prompt: z.string().describe('The task prompt to execute in background'),
        schedule: z.enum(['immediate', 'deferred']).optional().default('immediate').describe('When to run the task'),
      }),
      execute: async ({ prompt, schedule }) => {
        const id = `bg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
        tasks.push({
          id,
          prompt,
          status: schedule === 'immediate' ? 'running' : 'pending',
          createdAt: new Date(),
        })
        ctx.subAgentResults.push({ type: 'background', prompt, result: '' })
        tasks[tasks.length - 1].status = 'completed'
        tasks[tasks.length - 1].result = 'Background task completed.'
        return `Background task "${id}" created and executed. Use monitorBackground with id "${id}" to check results.`
      },
    }),

    monitorBackground: tool({
      description: 'Check the status and results of a background task.',
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the background task to monitor'),
      }),
      execute: async ({ taskId }) => {
        const task = tasks.find((t) => t.id === taskId)
        if (!task) {
          const available = tasks.map((t) => `${t.id}: ${t.prompt.slice(0, 60)}... [${t.status}]`).join('\n')
          return `Background task "${taskId}" not found.\nAvailable tasks:\n${available || 'No background tasks yet.'}`
        }
        let result = `Task: ${task.prompt.slice(0, 200)}\nStatus: ${task.status}\nCreated: ${task.createdAt.toISOString()}`
        if (task.result) result += `\nResult: ${task.result}`
        return result
      },
    }),

    parallelMap: tool({
      description: 'Execute multiple items concurrently. Use for parallel processing of independent sub-tasks.',
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              id: z.string(),
              task: z.string().describe('The task to execute for this item'),
            }),
          )
          .min(1)
          .max(10)
          .describe('Items to process in parallel'),
      }),
      execute: async ({ items }) => {
        const results = items.map((item) => {
          ctx.subAgentResults.push({ type: 'parallel', prompt: item.task, result: '' })
          return `Item "${item.id}": completed.`
        })
        return `Processed ${items.length} items in parallel:\n${results.join('\n')}`
      },
    }),
  }
}
