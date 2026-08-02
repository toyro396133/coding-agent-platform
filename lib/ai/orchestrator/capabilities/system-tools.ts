import { tool } from 'ai'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getRouterMetrics } from '@/lib/ai/router-metrics'
import { db } from '@/lib/db/client'
import { platformApiKeys, settings, tasks } from '@/lib/db/schema'
import { publishJobEvent } from '@/lib/jobs/event-bus'
import { getRateLimitManager } from '@/lib/rate-limits/manager'
import { getActiveSandboxCount, killSandbox } from '@/lib/sandbox/sandbox-registry'
import type { ToolContext } from './types'

/**
 * System capability pack — gives the AGENT complete control over the platform
 * itself (not just the repository). This is what makes 100% autonomy real:
 *
 *   - getSystemStatus        → overall health: active sandboxes, rate limits,
 *                              router metrics, running tasks
 *   - listActiveTasks        → the user's in-flight tasks + their status
 *   - stopTask               → stop a running task and kill its sandbox
 *   - listSandboxes          → how many sandboxes are currently alive
 *   - killSandbox            → kill a specific sandbox by task ID
 *   - getRateLimitStatus     → per-provider capacity / keys remaining
 *   - getRouterMetrics       → routing observability snapshot
 *   - listPlatformApiKeys    → the user's platform API keys (names + hints)
 *   - revokePlatformApiKey   → revoke a platform API key
 *   - getUserSettings        → the user's stored platform settings
 *   - setUserSetting         → update a platform setting
 *
 * All operations are scoped to the current user (ctx.userId) and are safe to
 * call from the orchestrator loop — every read/write is wrapped defensively so
 * a failure never propagates into the agent loop.
 */
export function createSystemTools(ctx: ToolContext) {
  const userId = ctx.userId
  if (!userId) {
    throw new Error('ToolContext must have userId set for system tools')
  }

  const safe = <T>(fn: () => Promise<T>, fallback: string): Promise<string> =>
    fn()
      .then((v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2)))
      .catch(() => fallback)

  return {
    getSystemStatus: tool({
      description:
        "Get an overall health snapshot of the platform: number of active sandboxes, rate-limit status per provider, router metrics, and the user's running tasks. Use this first to understand the state of the system before making control decisions.",
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const [sandboxCount, rateStatus, metrics, activeTasks] = await Promise.all([
            Promise.resolve(getActiveSandboxCount()),
            getRateLimitManager().getStatus(),
            Promise.resolve(getRouterMetrics().snapshot()),
            db
              .select({ id: tasks.id, status: tasks.status, title: tasks.title, progress: tasks.progress })
              .from(tasks)
              .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
              .orderBy(desc(tasks.createdAt))
              .limit(20),
          ])

          const running = activeTasks.filter((t) => ['pending', 'processing'].includes(t.status))

          return [
            '🖥️ **Platform System Status**',
            '',
            `🔢 Active sandboxes: ${sandboxCount}`,
            `📊 Router calls: ${metrics.routing.totalCalls} (fast: ${metrics.routing.fastPath}, llm: ${metrics.routing.llmPath}, cache hits: ${metrics.routing.cacheHits})`,
            `⛽ Rate limited: ${metrics.routing.rateLimited} times`,
            '',
            '🚦 **Provider rate limits**',
            ...Object.entries(rateStatus.providers).map(
              ([provider, s]) =>
                `- ${provider}: ${s.requestsRemaining} requests / ${s.tokensRemaining} tokens remaining (${s.healthyKeys} key(s))`,
            ),
            '',
            `📋 Running tasks (${running.length} active of ${activeTasks.length} total):`,
            ...(running.length === 0
              ? ['  (none)']
              : running.map((t) => `  - \`${t.id}\` [${t.status}] ${t.title || '(untitled)'} ${t.progress ?? 0}%`)),
          ].join('\n')
        }, 'Failed to read system status'),
    }),

    listActiveTasks: tool({
      description:
        "List the current user's tasks with their status and progress, newest first. Use this to see what the platform is working on right now.",
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const activeTasks = await db
            .select({ id: tasks.id, status: tasks.status, title: tasks.title, progress: tasks.progress })
            .from(tasks)
            .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
            .orderBy(desc(tasks.createdAt))
            .limit(25)

          if (activeTasks.length === 0) return 'No tasks found for this user.'
          return [
            '📋 **Tasks**',
            ...activeTasks.map((t) => `- \`${t.id}\` [${t.status}] ${t.title || '(untitled)'} ${t.progress ?? 0}%`),
          ].join('\n')
        }, 'Failed to list tasks'),
    }),

    stopTask: tool({
      description:
        'Stop a running task (pending/processing) for this user. Marks it as stopped and kills its sandbox. Use this to halt runaway or unwanted work.',
      inputSchema: z.object({
        taskId: z.string().describe('The task ID to stop'),
      }),
      execute: async ({ taskId }: { taskId: string }) =>
        safe(async () => {
          const [task] = await db
            .select({ id: tasks.id, status: tasks.status })
            .from(tasks)
            .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
            .limit(1)

          if (!task) return `❌ Task \`${taskId}\` not found or not owned by this user.`
          if (['completed', 'error', 'stopped'].includes(task.status)) {
            return `Task \`${taskId}\` is already in terminal state (${task.status}).`
          }

          await db
            .update(tasks)
            .set({
              status: 'stopped',
              error: 'Stopped by agent (full autonomy)',
              updatedAt: new Date(),
              completedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))

          // Notify any connected job stream and kill the sandbox
          publishJobEvent(taskId, { type: 'cancelled', status: 'stopped' })
          const kill = await killSandbox(taskId)

          return `✅ Stopped task \`${taskId}\`.${kill.success ? '' : ` (note: ${kill.error || 'sandbox already gone'})`}`
        }, 'Failed to stop task'),
    }),

    listSandboxes: tool({
      description: 'Report how many sandboxes are currently active on the platform (in this execution context).',
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const count = getActiveSandboxCount()
          return count === 0
            ? 'No active sandboxes in this execution context.'
            : `🔢 ${count} active sandbox(es) in this execution context.`
        }, 'Failed to read sandbox count'),
    }),

    killSandbox: tool({
      description:
        'Kill a sandbox by task ID for this user, freeing its resources immediately. Use when one of your own tasks has ended but its sandbox should be torn down.',
      inputSchema: z.object({
        taskId: z.string().describe('The task ID whose sandbox should be killed'),
      }),
      execute: async ({ taskId }: { taskId: string }) =>
        safe(async () => {
          // Ownership check: only kill sandboxes for tasks owned by this user,
          // mirroring stopTask so full autonomy can never tear down another
          // user's sandbox even if the agent knows the task ID.
          const [task] = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
            .limit(1)

          if (!task) return `❌ Task \`${taskId}\` not found or not owned by this user.`

          const result = await killSandbox(taskId)
          return result.success
            ? `✅ Sandbox for \`${taskId}\` killed.`
            : `⚠️ Could not kill sandbox: ${result.error || 'not found'}`
        }, 'Failed to kill sandbox'),
    }),

    getRateLimitStatus: tool({
      description:
        'Get per-provider rate-limit capacity: requests/tokens remaining and healthy keys. Use this before deciding which model to call.',
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const status = await getRateLimitManager().getStatus()
          const lines = [
            '🚦 **Rate Limit Status**',
            `Allowed: ${status.allowed} | Remaining: ${status.remaining}/${status.total}`,
          ]
          for (const [provider, s] of Object.entries(status.providers)) {
            lines.push(
              `- ${provider}: ${s.requestsRemaining} req / ${s.tokensRemaining} tok (${s.healthyKeys} keys) — reset in ${Math.round(s.windowResetInMs / 60000)}m`,
            )
          }
          return lines.join('\n')
        }, 'Failed to read rate limit status'),
    }),

    getRouterMetrics: tool({
      description:
        'Get the smart-router observability snapshot: total calls, fast/LLM path usage, cache hits, rate-limited downgrades, and per-category breakdown.',
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const metrics = getRouterMetrics().snapshot()
          const cats = Object.entries(metrics.routing.byCategory)
            .filter(([, n]) => n > 0)
            .map(([c, n]) => `- ${c}: ${n}`)
          return [
            '📊 **Router Metrics**',
            `Total calls: ${metrics.routing.totalCalls}`,
            `Fast path: ${metrics.routing.fastPath} | LLM path: ${metrics.routing.llmPath} | Cache hits: ${metrics.routing.cacheHits}`,
            `Rate limited: ${metrics.routing.rateLimited}`,
            `Cache size: ${metrics.cache.size} (ttl ${metrics.cache.ttlMs}ms)`,
            'Per category:',
            ...(cats.length ? cats : ['  (no calls yet)']),
          ].join('\n')
        }, 'Failed to read router metrics'),
    }),

    listPlatformApiKeys: tool({
      description:
        "List the user's platform API keys (names + hints only, never full values). Use this to audit API access.",
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const keys = await db
            .select({
              id: platformApiKeys.id,
              name: platformApiKeys.name,
              hint: platformApiKeys.hint,
              createdAt: platformApiKeys.createdAt,
            })
            .from(platformApiKeys)
            .where(eq(platformApiKeys.userId, userId))
            .orderBy(desc(platformApiKeys.createdAt))

          if (keys.length === 0) return 'No platform API keys for this user.'
          return ['🔑 **Platform API Keys**', ...keys.map((k) => `- \`${k.id}\` ${k.name} — ${k.hint}`)].join('\n')
        }, 'Failed to list platform API keys'),
    }),

    revokePlatformApiKey: tool({
      description:
        'Revoke (permanently delete) a platform API key owned by this user. Use for key rotation or when a key may have leaked.',
      inputSchema: z.object({
        keyId: z.string().describe('The API key ID to revoke'),
      }),
      execute: async ({ keyId }: { keyId: string }) =>
        safe(async () => {
          const deleted = await db
            .delete(platformApiKeys)
            .where(and(eq(platformApiKeys.id, keyId), eq(platformApiKeys.userId, userId)))
            .returning({ id: platformApiKeys.id })
          return deleted.length > 0
            ? `✅ Revoked platform API key \`${keyId}\`.`
            : `❌ API key \`${keyId}\` not found or not owned by this user.`
        }, 'Failed to revoke platform API key'),
    }),

    getUserSettings: tool({
      description: "List the user's stored platform settings (key → value).",
      inputSchema: z.object({}),
      execute: async () =>
        safe(async () => {
          const rows = await db
            .select({ key: settings.key, value: settings.value })
            .from(settings)
            .where(eq(settings.userId, userId))

          if (rows.length === 0) return 'No custom settings for this user.'
          return ['⚙️ **User Settings**', ...rows.map((r) => `- ${r.key}: ${r.value}`)].join('\n')
        }, 'Failed to read settings'),
    }),

    setUserSetting: tool({
      description:
        'Set (create or update) a platform setting for this user. Example keys: maxMessagesPerDay, maxSandboxDuration, executionLevel.',
      inputSchema: z.object({
        key: z.string().min(1).describe('Setting key (e.g. maxMessagesPerDay)'),
        value: z.string().min(1).describe('Setting value as a string (e.g. "100")'),
      }),
      execute: async ({ key, value }: { key: string; value: string }) =>
        safe(async () => {
          await db
            .insert(settings)
            .values({
              id: `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              userId,
              key,
              value,
            })
            .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value, updatedAt: new Date() } })
          return `✅ Setting \`${key}\` = \`${value}\` saved.`
        }, 'Failed to save setting'),
    }),
  }
}
