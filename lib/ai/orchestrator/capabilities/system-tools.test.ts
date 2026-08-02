import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  function makeQuery(result: unknown[]) {
    // Chainable query builder mock: every method returns q, and q is thenable
    // so awaiting it (at whatever terminal call) resolves to `result`.
    const q: any = {
      from: vi.fn(() => q),
      where: vi.fn(() => q),
      orderBy: vi.fn(() => q),
      limit: vi.fn(() => q),
      returning: vi.fn(() => q),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
    }
    return q
  }

  const db = {
    select: vi.fn(() => makeQuery([])),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(async () => []) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [] as any[]) })) })),
  }

  return {
    db,
    makeQuery,
    getActiveSandboxCount: vi.fn(() => 2),
    killSandbox: vi.fn(async () => ({ success: true })),
    getRateLimitStatus: vi.fn(async () => ({
      allowed: true,
      remaining: 100,
      total: 500,
      providers: {
        openai: { requestsRemaining: 100, tokensRemaining: 1000, healthyKeys: 2, windowResetInMs: 3600000 },
        anthropic: { requestsRemaining: 50, tokensRemaining: 500, healthyKeys: 1, windowResetInMs: 3600000 },
      },
    })),
    snapshot: vi.fn(() => ({
      routing: {
        totalCalls: 42,
        fastPath: 30,
        llmPath: 12,
        cacheHits: 3,
        rateLimited: 1,
        cacheSize: 5,
        byCategory: { debug: 10 },
        byModel: {},
        avgConfidence: 0.8,
      },
      cache: { hits: 3, misses: 9, size: 5, ttlMs: 60000, maxEntries: 100 },
    })),
    publishJobEvent: vi.fn(),
  }
})

vi.mock('@/lib/db/client', () => ({ db: h.db }))

vi.mock('@/lib/db/schema', () => ({
  tasks: {
    id: 'id',
    userId: 'user_id',
    status: 'status',
    title: 'title',
    progress: 'progress',
    createdAt: 'created_at',
    deletedAt: 'deleted_at',
  },
  platformApiKeys: { id: 'id', userId: 'user_id', name: 'name', hint: 'hint', createdAt: 'created_at' },
  settings: { id: 'id', userId: 'user_id', key: 'key', value: 'value', updatedAt: 'updated_at' },
}))

vi.mock('@/lib/sandbox/sandbox-registry', () => ({
  getActiveSandboxCount: h.getActiveSandboxCount,
  killSandbox: h.killSandbox,
}))

vi.mock('@/lib/rate-limits/manager', () => ({
  getRateLimitManager: () => ({ getStatus: h.getRateLimitStatus }),
}))

vi.mock('@/lib/ai/router-metrics', () => ({
  getRouterMetrics: () => ({ snapshot: h.snapshot }),
}))

vi.mock('@/lib/jobs/event-bus', () => ({
  publishJobEvent: h.publishJobEvent,
}))

import { createSystemTools } from './system-tools'
import type { ToolContext } from './types'

function makeCtx(): ToolContext {
  return {
    taskId: 'task-1',
    userId: 'user-1',
    capabilityLevel: 'enhanced',
    autonomyLevel: 'full',
    accumulatedContext: '',
    subAgentResults: [],
    checkpoint: async () => 'ck',
    restore: async () => {},
  }
}

async function call(toolName: string, input: Record<string, unknown> = {}) {
  const tools = createSystemTools(makeCtx())
  return (tools as Record<string, any>)[toolName].execute(input)
}

describe('system-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no active tasks
    h.db.select.mockImplementation(() => h.makeQuery([]))
    h.getActiveSandboxCount.mockReturnValue(2)
  })

  describe('getSystemStatus', () => {
    it('returns sandbox count, rate limits, metrics and running tasks', async () => {
      const result = await call('getSystemStatus')
      expect(result).toContain('Active sandboxes: 2')
      expect(result).toContain('Router calls: 42')
      expect(result).toContain('openai: 100 requests')
      expect(result).toContain('Running tasks (0 active')
    })

    it('lists active running tasks', async () => {
      h.db.select.mockImplementation(() =>
        h.makeQuery([
          { id: 't1', status: 'processing', title: 'Fix bug', progress: 50 },
          { id: 't2', status: 'completed', title: 'Done', progress: 100 },
        ]),
      )
      const result = await call('getSystemStatus')
      expect(result).toContain('Running tasks (1 active of 2 total)')
      expect(result).toContain('`t1` [processing] Fix bug 50%')
    })
  })

  describe('stopTask', () => {
    it('stops a running task, publishes an event and kills its sandbox', async () => {
      h.db.select.mockImplementation(() => h.makeQuery([{ id: 't1', status: 'processing' }]))

      const result = await call('stopTask', { taskId: 't1' })

      expect(result).toContain('Stopped task `t1`')
      expect(h.publishJobEvent).toHaveBeenCalledWith('t1', { type: 'cancelled', status: 'stopped' })
      expect(h.killSandbox).toHaveBeenCalledWith('t1')
    })

    it('refuses to stop a task in a terminal state', async () => {
      h.db.select.mockImplementation(() => h.makeQuery([{ id: 't1', status: 'completed' }]))

      const result = await call('stopTask', { taskId: 't1' })

      expect(result).toContain('already in terminal state')
      expect(h.killSandbox).not.toHaveBeenCalled()
    })

    it('returns an error for a task not owned by the user', async () => {
      h.db.select.mockImplementation(() => h.makeQuery([]))

      const result = await call('stopTask', { taskId: 't1' })

      expect(result).toContain('not found or not owned')
    })
  })

  describe('killSandbox', () => {
    it('kills a sandbox for a task owned by the user', async () => {
      h.db.select.mockImplementation(() => h.makeQuery([{ id: 't1' }]))

      const result = await call('killSandbox', { taskId: 't1' })

      expect(result).toContain('Sandbox for `t1` killed')
      expect(h.killSandbox).toHaveBeenCalledWith('t1')
    })

    it('refuses to kill a sandbox for a task not owned by the user', async () => {
      h.db.select.mockImplementation(() => h.makeQuery([]))

      const result = await call('killSandbox', { taskId: 't1' })

      expect(result).toContain('not found or not owned')
      expect(h.killSandbox).not.toHaveBeenCalled()
    })
  })

  describe('platform API keys', () => {
    it('lists keys with name and hint only', async () => {
      h.db.select.mockImplementation(() =>
        h.makeQuery([{ id: 'k1', name: 'prod', hint: 'sk-platform-...abcd', createdAt: new Date() }]),
      )

      const result = await call('listPlatformApiKeys')
      expect(result).toContain('`k1` prod — sk-platform-...abcd')
    })

    it('revokes a key scoped to the current user', async () => {
      h.db.delete.mockImplementation(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'k1' }]) })),
      }))

      const result = await call('revokePlatformApiKey', { keyId: 'k1' })
      expect(result).toContain('Revoked platform API key `k1`')
    })

    it('reports when the key is not owned by the user', async () => {
      h.db.delete.mockImplementation(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
      }))

      const result = await call('revokePlatformApiKey', { keyId: 'k1' })
      expect(result).toContain('not found or not owned')
    })
  })

  describe('settings', () => {
    it('lists the user settings', async () => {
      h.db.select.mockImplementation(() =>
        h.makeQuery([
          { key: 'maxMessagesPerDay', value: '100' },
          { key: 'maxSandboxDuration', value: '60' },
        ]),
      )

      const result = await call('getUserSettings')
      expect(result).toContain('maxMessagesPerDay: 100')
      expect(result).toContain('maxSandboxDuration: 60')
    })

    it('saves a setting with upsert', async () => {
      const result = await call('setUserSetting', { key: 'maxSandboxDuration', value: '90' })
      expect(result).toContain('Setting `maxSandboxDuration` = `90` saved')
      expect(h.db.insert).toHaveBeenCalled()
    })
  })

  describe('rate limits & metrics', () => {
    it('reports per-provider rate limit capacity', async () => {
      const result = await call('getRateLimitStatus')
      expect(result).toContain('openai: 100 req')
      expect(result).toContain('anthropic: 50 req')
    })

    it('reports router metrics', async () => {
      const result = await call('getRouterMetrics')
      expect(result).toContain('Total calls: 42')
      expect(result).toContain('Fast path: 30 | LLM path: 12 | Cache hits: 3')
    })
  })
})
