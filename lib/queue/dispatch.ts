/**
 * lib/queue/dispatch.ts — bridges the request queue to the background task
 * pipeline.
 *
 * A queue item is claimed by `advanceQueue` (status → processing, taskId
 * attached) but its actual sandbox run happens through the standard task
 * pipeline: we POST to the internal `/api/tasks` endpoint with the same
 * session cookie, so the tasks route authenticates the user, creates the task
 * row and kicks off background processing (branch name, sandbox, agent…).
 *
 * When that task reaches a terminal state, the tasks route completes the
 * linked queue item and advances the queue to the next request — so queued
 * requests (including agent-added follow-up steps) run one at a time,
 * automatically, in order.
 */

import { db } from '@/lib/db/client'
import { requestQueue, tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { advanceQueue, releaseQueueItem, type QueueItem } from './engine'

/**
 * Dispatch a claimed queue item to the background task pipeline by POSTing to
 * the internal `/api/tasks` endpoint. The session cookie is forwarded so the
 * tasks route can authenticate the same user (it reads cookies, not the
 * internal bearer token).
 *
 * On failure the queue item is released back to `queued` so it can be retried
 * by a later auto-advance — unless the task row was already created (e.g. the
 * request reached the tasks route but the response was lost), in which case we
 * keep the item `processing` and let the task drive the queue forward.
 */
export async function dispatchQueueItem(
  userId: string,
  taskId: string,
  item: QueueItem,
  cookieHeader?: string | null,
): Promise<boolean> {
  // Note: this requires INTERNAL_API_BASE_URL + INTERNAL_SYSTEM_TOKEN to be
  // set (same constraint as the OpenAI-compatible endpoint). Without them the
  // item is released back to `queued` and the queue never advances.
  const baseUrl = process.env.INTERNAL_API_BASE_URL
  const internalToken = process.env.INTERNAL_SYSTEM_TOKEN
  if (!baseUrl || !internalToken) {
    await releaseQueueItem(userId, item.id)
    return false
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({
        id: taskId,
        prompt: item.prompt,
        title: item.title ?? undefined,
        repoUrl: item.repoUrl ?? undefined,
        selectedAgent: item.selectedAgent,
        selectedModel: item.selectedModel ?? undefined,
        installDependencies: item.installDependencies,
        maxDuration: item.maxDuration ?? undefined,
        keepAlive: item.keepAlive,
        enableBrowser: item.enableBrowser,
        executionMode: 'orchestrator_external',
        executionLevel: 'auto',
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      // Only release if the task was never created — otherwise let the task
      // drive the queue once it reaches a terminal state.
      const [existing] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
      if (!existing) {
        if (response.status === 429) {
          // Rate limit hit: this item would fail on every retry today, so mark
          // it as errored instead of silently retrying forever.
          await db
            .update(requestQueue)
            .set({ status: 'error', error: 'Rate limit reached — request was not started', updatedAt: new Date() })
            .where(eq(requestQueue.id, item.id))
        } else {
          await releaseQueueItem(userId, item.id)
        }
      }
      return false
    }
    return true
  } catch (error) {
    clearTimeout(timeoutId)
    await releaseQueueItem(userId, item.id)
    return false
  }
}

/**
 * Advance the queue (if nothing is currently running) and dispatch the next
 * item's background run. Used by the queue route after an enqueue and by the
 * tasks route once a task reaches a terminal state (auto-advance chain).
 */
export async function advanceAndDispatchQueue(
  userId: string,
  cookieHeader?: string | null,
): Promise<{ started: boolean; taskId?: string }> {
  const result = await advanceQueue(userId)
  if (!result.started || !result.taskId || !result.item) {
    return { started: false }
  }
  const ok = await dispatchQueueItem(userId, result.taskId, result.item, cookieHeader)
  return { started: ok, taskId: ok ? result.taskId : undefined }
}
