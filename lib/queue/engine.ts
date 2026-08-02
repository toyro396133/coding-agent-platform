/**
 * lib/queue/engine.ts — Real user-request queue engine.
 *
 * This is the SECOND queue in the platform (distinct from the agent's internal
 * to-do list in `lib/ai/orchestrator/task-queue.ts`):
 *
 *   1. The USER enqueues requests (or the AGENT enqueues follow-up steps).
 *   2. Requests wait in `request_queue` with an explicit `position` order that
 *      the user can reorder at any time.
 *   3. When nothing is currently processing, the next queued request is
 *      dispatched automatically (auto-advance), creating a real `tasks` row
 *      and triggering the existing task pipeline.
 *   4. The AGENT can read / edit / merge / delete queued requests via the
 *      orchestrator's `queue` capability pack, so it can consolidate related
 *      requests or remove ones already implemented.
 *
 * Security: every operation is scoped to `userId`; the API key pool rotation
 * and rate limits are already handled upstream by the task pipeline.
 */

import { and, asc, desc, eq, isNull, lt, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { requestQueue, tasks } from '@/lib/db/schema'

// ─── Types ──────────────────────────────────────────────────────────────

export type QueueStatus = 'queued' | 'processing' | 'completed' | 'error' | 'stopped'
export type QueueSource = 'user' | 'agent'

export interface EnqueueInput {
  userId: string
  prompt: string
  title?: string | null
  repoUrl?: string | null
  selectedAgent?: string
  selectedModel?: string | null
  installDependencies?: boolean
  keepAlive?: boolean
  enableBrowser?: boolean
  maxDuration?: number | null
  source?: QueueSource
  notes?: string | null
}

export interface QueueItem {
  id: string
  userId: string
  prompt: string
  title: string | null
  repoUrl: string | null
  selectedAgent: string
  selectedModel: string | null
  installDependencies: boolean
  keepAlive: boolean
  enableBrowser: boolean
  maxDuration: number | null
  position: number
  status: QueueStatus
  source: QueueSource
  taskId: string | null
  error: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  deletedAt: Date | null
}

// ─── Row mapping ────────────────────────────────────────────────────────

function toQueueItem(row: typeof requestQueue.$inferSelect): QueueItem {
  return {
    id: row.id,
    userId: row.userId,
    prompt: row.prompt,
    title: row.title,
    repoUrl: row.repoUrl,
    selectedAgent: row.selectedAgent,
    selectedModel: row.selectedModel,
    installDependencies: row.installDependencies,
    keepAlive: row.keepAlive,
    enableBrowser: row.enableBrowser,
    maxDuration: row.maxDuration,
    position: row.position,
    status: row.status as QueueStatus,
    source: row.source as QueueSource,
    taskId: row.taskId,
    error: row.error,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    deletedAt: row.deletedAt,
  }
}

// ─── Queue CRUD ─────────────────────────────────────────────────────────

/** Compute the next position for a new item (max existing + 1). */
async function nextPosition(userId: string): Promise<number> {
  const rows = await db
    .select({ position: requestQueue.position })
    .from(requestQueue)
    .where(and(eq(requestQueue.userId, userId), isNull(requestQueue.deletedAt)))
    .orderBy(desc(requestQueue.position))
    .limit(1)

  return rows.length > 0 ? rows[0].position + 1 : 0
}

/**
 * Enqueue a new request. Returns the created queue item (always `queued`).
 * Note: this does NOT auto-dispatch — call `advanceQueue()` to start the next
 * item if nothing is currently processing.
 */
export async function enqueueRequest(input: EnqueueInput): Promise<QueueItem> {
  const position = await nextPosition(input.userId)

  const [row] = await db
    .insert(requestQueue)
    .values({
      id: nanoid(),
      userId: input.userId,
      prompt: input.prompt,
      title: input.title ?? null,
      repoUrl: input.repoUrl ?? null,
      selectedAgent: input.selectedAgent ?? 'claude',
      selectedModel: input.selectedModel ?? null,
      installDependencies: input.installDependencies ?? false,
      keepAlive: input.keepAlive ?? false,
      enableBrowser: input.enableBrowser ?? false,
      maxDuration: input.maxDuration ?? null,
      position,
      status: 'queued',
      source: input.source ?? 'user',
      notes: input.notes ?? null,
    })
    .returning()

  return toQueueItem(row)
}

/** List all non-deleted queue items for a user, ordered by position. */
export async function listQueue(userId: string): Promise<QueueItem[]> {
  const rows = await db
    .select()
    .from(requestQueue)
    .where(and(eq(requestQueue.userId, userId), isNull(requestQueue.deletedAt)))
    .orderBy(asc(requestQueue.position), asc(requestQueue.createdAt))

  return rows.map(toQueueItem)
}

/** Get a single queue item scoped to the user. */
export async function getQueueItem(userId: string, id: string): Promise<QueueItem | null> {
  const [row] = await db
    .select()
    .from(requestQueue)
    .where(and(eq(requestQueue.id, id), eq(requestQueue.userId, userId), isNull(requestQueue.deletedAt)))
    .limit(1)

  return row ? toQueueItem(row) : null
}

export interface UpdateQueueInput {
  prompt?: string
  title?: string | null
  repoUrl?: string | null
  selectedAgent?: string
  selectedModel?: string | null
  notes?: string | null
}

/** Edit a queued request's content (used by the user and by the agent). */
export async function updateQueueRequest(
  userId: string,
  id: string,
  updates: UpdateQueueInput,
): Promise<QueueItem | null> {
  const existing = await getQueueItem(userId, id)
  if (!existing) return null

  const [row] = await db
    .update(requestQueue)
    .set({
      prompt: updates.prompt ?? existing.prompt,
      title: updates.title !== undefined ? updates.title : existing.title,
      repoUrl: updates.repoUrl !== undefined ? updates.repoUrl : existing.repoUrl,
      selectedAgent: updates.selectedAgent ?? existing.selectedAgent,
      selectedModel: updates.selectedModel !== undefined ? updates.selectedModel : existing.selectedModel,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(requestQueue.id, id), eq(requestQueue.userId, userId)))
    .returning()

  return row ? toQueueItem(row) : null
}

/**
 * Reorder a queue item to a new 0-based position among non-deleted items.
 * The whole affected range is shifted to keep positions contiguous.
 */
export async function reorderQueueRequest(userId: string, id: string, newPosition: number): Promise<QueueItem[]> {
  const items = await listQueue(userId)
  if (items.length === 0) return items

  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return items

  const clamped = Math.max(0, Math.min(newPosition, items.length - 1))
  if (clamped === index) return items

  const [moved] = items.splice(index, 1)
  items.splice(clamped, 0, moved)

  // Rewrite positions for all items in order (transactional enough for a queue).
  for (let i = 0; i < items.length; i++) {
    await db
      .update(requestQueue)
      .set({ position: i, updatedAt: new Date() })
      .where(and(eq(requestQueue.id, items[i].id), eq(requestQueue.userId, userId)))
  }

  return items
}

/** Soft-delete a queue item (marks it deleted + stopped). */
export async function deleteQueueRequest(userId: string, id: string): Promise<boolean> {
  const existing = await getQueueItem(userId, id)
  if (!existing) return false

  await db
    .update(requestQueue)
    .set({ deletedAt: new Date(), status: 'stopped', updatedAt: new Date() })
    .where(and(eq(requestQueue.id, id), eq(requestQueue.userId, userId)))

  // Compact positions so the order stays contiguous.
  const items = await listQueue(userId)
  for (let i = 0; i < items.length; i++) {
    await db
      .update(requestQueue)
      .set({ position: i, updatedAt: new Date() })
      .where(and(eq(requestQueue.id, items[i].id), eq(requestQueue.userId, userId)))
  }

  return true
}

/**
 * Merge one or more queued requests into a single target request.
 * The target keeps its position; merged requests are soft-deleted.
 * Used by the agent to consolidate related requests that touch the same area.
 */
export async function mergeQueueRequests(
  userId: string,
  targetId: string,
  mergeIds: string[],
): Promise<QueueItem | null> {
  const target = await getQueueItem(userId, targetId)
  if (!target) return null

  const validMergeIds = mergeIds.filter((id) => id !== targetId)
  if (validMergeIds.length === 0) return target

  const sections: string[] = []
  for (const id of validMergeIds) {
    const item = await getQueueItem(userId, id)
    if (!item) continue
    sections.push(item.prompt)
    await db
      .update(requestQueue)
      .set({ deletedAt: new Date(), status: 'stopped', updatedAt: new Date() })
      .where(and(eq(requestQueue.id, id), eq(requestQueue.userId, userId)))
  }

  if (sections.length === 0) return target

  const mergedPrompt = [target.prompt, ...sections.map((s, i) => `\n\n[Merged request ${i + 1}]\n${s}`)].join('')

  const [row] = await db
    .update(requestQueue)
    .set({
      prompt: mergedPrompt,
      title: target.title ? `${target.title} (merged ${sections.length})` : target.title,
      notes: target.notes
        ? `${target.notes} — merged ${sections.length} request(s)`
        : `Merged ${sections.length} request(s)`,
      updatedAt: new Date(),
    })
    .where(and(eq(requestQueue.id, targetId), eq(requestQueue.userId, userId)))
    .returning()

  // Compact positions.
  const items = await listQueue(userId)
  for (let i = 0; i < items.length; i++) {
    await db
      .update(requestQueue)
      .set({ position: i, updatedAt: new Date() })
      .where(and(eq(requestQueue.id, items[i].id), eq(requestQueue.userId, userId)))
  }

  return row ? toQueueItem(row) : null
}

// ─── Dispatch / auto-advance ────────────────────────────────────────────

/**
 * Get the next queued item that is ready to be dispatched (status `queued`,
 * not deleted), ordered by position. Returns null if the queue is empty, a
 * request is already processing, or ANY task for this user is still active
 * (pending/processing) — so the queue runs serially, one request at a time,
 * and queued requests wait for the currently running task to finish.
 */
export async function peekNextReady(userId: string): Promise<QueueItem | null> {
  const [processing] = await db
    .select({ id: requestQueue.id })
    .from(requestQueue)
    .where(and(eq(requestQueue.userId, userId), eq(requestQueue.status, 'processing'), isNull(requestQueue.deletedAt)))
    .limit(1)

  if (processing) return null

  // Serial execution: don't start a queued request while any task for this
  // user is pending/processing (either a normal task or a queue-dispatched
  // task whose row is already created).
  const [activeTask] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        or(eq(tasks.status, 'pending'), eq(tasks.status, 'processing')),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1)

  if (activeTask) return null

  const [next] = await db
    .select()
    .from(requestQueue)
    .where(and(eq(requestQueue.userId, userId), eq(requestQueue.status, 'queued'), isNull(requestQueue.deletedAt)))
    .orderBy(asc(requestQueue.position), asc(requestQueue.createdAt))
    .limit(1)

  return next ? toQueueItem(next) : null
}

/**
 * Claim a queue item for execution: mark it `processing` and attach a fresh
 * task id. The linked `tasks` row is NOT created here — the dispatcher
 * (`dispatchQueueTask`) creates it through the standard task pipeline
 * (internal POST /api/tasks) so the normal execution flow applies.
 * Returns the claimed task id, or null if the item was already running.
 */
export async function startQueueItem(item: QueueItem): Promise<string | null> {
  const taskId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  // Claim the item atomically: only proceed if it's still `queued`.
  const [claimed] = await db
    .update(requestQueue)
    .set({ status: 'processing', taskId, updatedAt: new Date() })
    .where(and(eq(requestQueue.id, item.id), eq(requestQueue.userId, item.userId), eq(requestQueue.status, 'queued')))
    .returning()

  if (!claimed) return null

  return taskId
}

/**
 * Release a claimed queue item back to `queued` when its background dispatch
 * failed before the linked task ever started (e.g. internal API unreachable),
 * so it can be retried by the next auto-advance instead of being stuck.
 */
export async function releaseQueueItem(userId: string, id: string): Promise<void> {
  await db
    .update(requestQueue)
    .set({ status: 'queued', taskId: null, updatedAt: new Date() })
    .where(and(eq(requestQueue.id, id), eq(requestQueue.userId, userId)))
}

/**
 * Complete a queue item once its linked task reaches a terminal state.
 * Marks the item completed/error/stopped based on the task status, then
 * attempts to advance the queue to the next request.
 */
export async function completeQueueItem(userId: string, taskId: string): Promise<void> {
  const [item] = await db
    .select()
    .from(requestQueue)
    .where(and(eq(requestQueue.taskId, taskId), eq(requestQueue.userId, userId)))
    .limit(1)

  if (!item) return

  const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1)

  const terminalStatus: QueueStatus =
    task?.status === 'completed' ? 'completed' : task?.status === 'error' ? 'error' : 'stopped'

  await db
    .update(requestQueue)
    .set({
      status: terminalStatus,
      completedAt: new Date(),
      error: terminalStatus === 'error' ? 'Task failed during execution' : null,
      updatedAt: new Date(),
    })
    .where(eq(requestQueue.id, item.id))
}

/**
 * Reclaim queue items that were stuck in `processing` because their serverless
 * dispatch died before the linked task ever reached a terminal state (no
 * `completeQueueItem` will ever be called). Items older than the threshold are
 * reset to `queued` so the queue can move on instead of deadlocking forever.
 */
async function reclaimStaleQueueItems(userId: string): Promise<void> {
  const staleWindowMs = 2 * 60 * 60 * 1000 // 2 hours
  const cutoff = new Date(Date.now() - staleWindowMs)

  const stale = await db
    .select({ id: requestQueue.id, taskId: requestQueue.taskId })
    .from(requestQueue)
    .where(
      and(
        eq(requestQueue.userId, userId),
        eq(requestQueue.status, 'processing'),
        isNull(requestQueue.deletedAt),
        // updatedAt is touched on claim and on completion — an item stuck in
        // processing for the whole window has no live dispatcher.
        lt(requestQueue.updatedAt, cutoff),
      ),
    )

  for (const row of stale) {
    // Only reclaim when the linked task is no longer running. If it is still
    // pending/processing it will drive the queue forward on completion, and
    // releasing the item now would risk a duplicate run later.
    if (row.taskId) {
      const [linkedTask] = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, row.taskId))
        .limit(1)
      if (linkedTask && (linkedTask.status === 'pending' || linkedTask.status === 'processing')) {
        continue
      }
    }
    await releaseQueueItem(userId, row.id)
  }
}

/**
 * Advance the queue: if nothing is processing, claim the next queued request
 * and attach a task id to it. Returns the claimed item so the caller can
 * dispatch its background run via `dispatchQueueTask`.
 */
export async function advanceQueue(userId: string): Promise<{ started: boolean; taskId?: string; item?: QueueItem }> {
  // Self-heal: unstick queue items whose dispatcher died before completion.
  await reclaimStaleQueueItems(userId)

  const next = await peekNextReady(userId)
  if (!next) return { started: false }

  const taskId = await startQueueItem(next)
  if (!taskId) return { started: false }

  return { started: true, taskId, item: next }
}

/**
 * Enqueue multiple follow-up steps (agent-generated). The queue advances
 * automatically once the current task reaches a terminal state (see the tasks
 * route completion hook), so these steps run next, in order.
 * Returns the created queue item ids.
 */
export async function enqueueFollowUpSteps(
  userId: string,
  steps: { prompt: string; repoUrl?: string | null; title?: string }[],
): Promise<string[]> {
  const ids: string[] = []
  for (const step of steps) {
    const item = await enqueueRequest({
      userId,
      prompt: step.prompt,
      title: step.title ?? null,
      repoUrl: step.repoUrl ?? null,
      source: 'agent',
      notes: 'Follow-up step added by the agent',
    })
    ids.push(item.id)
  }
  return ids
}
