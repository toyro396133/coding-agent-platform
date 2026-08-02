import { tool } from 'ai'
import { z } from 'zod'
import {
  deleteQueueRequest,
  enqueueFollowUpSteps,
  listQueue,
  mergeQueueRequests,
  reorderQueueRequest,
  updateQueueRequest,
} from '@/lib/queue/engine'
import type { ToolContext } from './types'

/**
 * Queue capability pack — gives the AGENT full management power over the user
 * request queue (`request_queue` table), distinct from the internal to-do list.
 *
 * The agent can:
 *   - listQueueRequests  → see everything the user has queued (+ status)
 *   - editQueueRequest   → rewrite a request's prompt/title/repo so it reflects
 *                          the user's real intent (e.g. after clarifying)
 *   - reorderQueueRequest→ move a request up/down to adjust priority
 *   - mergeQueueRequests → consolidate related requests touching the same area
 *                          into one high-quality request
 *   - deleteQueueRequest → remove requests that were already implemented by an
 *                          earlier task (no wasted runs)
 *   - enqueueFollowUpSteps → append next-steps to the queue at the end of the
 *                          response; they are picked up automatically.
 *
 * All operations are scoped to the current user (ctx.userId).
 */
export function createQueueTools(ctx: ToolContext) {
  const userId = ctx.userId
  if (!userId) {
    throw new Error('ToolContext must have userId set for queue tools')
  }

  return {
    listQueueRequests: tool({
      description:
        "List all requests in the user's queue with their status, position, source (user/agent) and linked task. Use this to see what the user has queued, what is currently processing, and what already completed. Then decide whether to edit, merge, delete or reorder items.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const items = await listQueue(userId)
          if (items.length === 0) {
            return '📥 **Queue is empty** — no requests waiting to be executed.'
          }

          const lines = ['📥 **Request Queue**', '', `Total: ${items.length} request(s)`, '']
          for (const item of items) {
            const statusIcon =
              item.status === 'completed'
                ? '✅'
                : item.status === 'error'
                  ? '❌'
                  : item.status === 'processing'
                    ? '🔄'
                    : item.status === 'stopped'
                      ? '⏹️'
                      : '⏳'
            const source = item.source === 'agent' ? '🤖 agent' : '👤 user'
            const title = item.title || item.prompt.substring(0, 80) + (item.prompt.length > 80 ? '…' : '')
            lines.push(`${statusIcon} [${item.position}] ${title} (source: ${source})`)
            lines.push(`   ID: \`${item.id}\` | Status: ${item.status}`)
            if (item.repoUrl) lines.push(`   Repo: ${item.repoUrl}`)
            if (item.taskId) lines.push(`   Task: \`${item.taskId}\``)
            if (item.notes) lines.push(`   Note: ${item.notes}`)
            lines.push('')
          }

          lines.push(
            'You can manage this queue with editQueueRequest, reorderQueueRequest, mergeQueueRequests, deleteQueueRequest and enqueueFollowUpSteps.',
          )
          return lines.join('\n')
        } catch (_error) {
          return 'Failed to read the queue — please try again.'
        }
      },
    }),

    editQueueRequest: tool({
      description:
        'Edit a queued request (prompt, title, repo URL). Use this to rewrite a request so it captures the user’s real intent, or to merge new clarifying details into an existing request instead of creating a duplicate.',
      inputSchema: z.object({
        requestId: z.string().describe('The queue request ID to edit'),
        prompt: z.string().optional().describe('New prompt text (replaces the old one)'),
        title: z.string().optional().describe('New short title'),
        repoUrl: z.string().optional().describe('New repository URL (https://github.com/owner/repo)'),
      }),
      execute: async ({ requestId, prompt, title, repoUrl }) => {
        try {
          const updated = await updateQueueRequest(userId, requestId, {
            prompt,
            title: title ?? undefined,
            repoUrl: repoUrl ?? undefined,
          })
          if (!updated) {
            return `❌ Queue request \`${requestId}\` not found. Use listQueueRequests to see available requests.`
          }
          return `✅ Queue request updated: \`${requestId}\`\n- Prompt: ${updated.prompt.substring(0, 200)}${updated.prompt.length > 200 ? '…' : ''}`
        } catch (_error) {
          return 'Failed to update the queue request.'
        }
      },
    }),

    reorderQueueRequest: tool({
      description:
        'Move a queued request to a new 0-based position in the queue (0 = first to run). Use this to prioritize urgent work or push non-critical requests down.',
      inputSchema: z.object({
        requestId: z.string().describe('The queue request ID to move'),
        newPosition: z.number().int().min(0).describe('The new 0-based position in the queue (0 = next to run)'),
      }),
      execute: async ({ requestId, newPosition }) => {
        try {
          const queue = await reorderQueueRequest(userId, requestId, newPosition)
          return `✅ Reordered queue request \`${requestId}\` to position ${newPosition}. New order:\n${queue
            .map((item) => `  ${item.position}. ${item.title || item.prompt.substring(0, 60)}`)
            .join('\n')}`
        } catch (_error) {
          return 'Failed to reorder the queue.'
        }
      },
    }),

    mergeQueueRequests: tool({
      description:
        'Merge one or more queued requests into a single target request. Use this when several queued requests target the same code area — combine them into one coherent, high-quality request to avoid conflicting edits.',
      inputSchema: z.object({
        targetId: z
          .string()
          .describe('The queue request ID that will keep its position and receive the merged content'),
        mergeIds: z.array(z.string()).describe('The queue request IDs to merge INTO the target (they will be removed)'),
      }),
      execute: async ({ targetId, mergeIds }) => {
        try {
          const merged = await mergeQueueRequests(userId, targetId, mergeIds)
          if (!merged) {
            return `❌ Target queue request \`${targetId}\` not found. Use listQueueRequests to see available requests.`
          }
          return `✅ Merged ${mergeIds.length} request(s) into \`${targetId}\`.\nCombined prompt:\n${merged.prompt.substring(0, 500)}${merged.prompt.length > 500 ? '…' : ''}`
        } catch (_error) {
          return 'Failed to merge the queue requests.'
        }
      },
    }),

    deleteQueueRequest: tool({
      description:
        'Delete a queued request that is no longer needed (e.g. already implemented by an earlier task, superseded, or duplicated). Removes it from the execution order.',
      inputSchema: z.object({
        requestId: z.string().describe('The queue request ID to delete'),
        reason: z.string().optional().describe('Why the request is being removed'),
      }),
      execute: async ({ requestId }) => {
        try {
          const deleted = await deleteQueueRequest(userId, requestId)
          if (!deleted) {
            return `❌ Queue request \`${requestId}\` not found.`
          }
          return `✅ Queue request \`${requestId}\` deleted — it will not be executed.`
        } catch (_error) {
          return 'Failed to delete the queue request.'
        }
      },
    }),

    enqueueFollowUpSteps: tool({
      description:
        'Add follow-up steps to the user’s request queue. Use this at the end of your response when more work should happen automatically after the current task finishes (e.g. run the tests, deploy, update the README, open a PR). Each step is enqueued as an agent-sourced request and executed in order once the current work completes.',
      inputSchema: z.object({
        steps: z
          .array(
            z.object({
              prompt: z.string().describe('The follow-up step to perform'),
              title: z.string().optional().describe('Optional short title'),
              repoUrl: z.string().optional().describe('Optional repository URL if different from the current one'),
            }),
          )
          .min(1)
          .max(10)
          .describe('The follow-up steps to enqueue'),
      }),
      execute: async ({ steps }) => {
        try {
          const ids = await enqueueFollowUpSteps(
            userId,
            steps.map((s) => ({ prompt: s.prompt, title: s.title ?? undefined, repoUrl: s.repoUrl ?? null })),
          )
          return `✅ Enqueued ${ids.length} follow-up step(s) — they will run automatically once the current task completes.\n${steps
            .map((s, i) => `  ${i + 1}. ${s.title || s.prompt.substring(0, 80)} (\`${ids[i]}\`)`)
            .join('\n')}`
        } catch (_error) {
          return 'Failed to enqueue follow-up steps.'
        }
      },
    }),
  }
}
