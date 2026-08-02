import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const setMock = vi.fn(() => ({ where: vi.fn(async () => []) }))
  const txUpdate = vi.fn(() => ({ set: setMock }))
  const txInsert = vi.fn(() => ({ values: vi.fn(async () => []) }))
  const txSelect = vi.fn(() => makeQuery([]))

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
    transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => {
      await fn({
        select: txSelect,
        insert: txInsert,
        update: txUpdate,
      })
    }),
    select: vi.fn(() => makeQuery([{ version: 1 }])),
  }

  return { db, txSelect, txInsert, txUpdate, setMock, makeQuery }
})

vi.mock('@/lib/db/client', () => ({ db: h.db }))

vi.mock('@/lib/db/schema', () => ({
  taskPlans: {
    id: 'id',
    taskId: 'task_id',
    planContent: 'plan_content',
    hash: 'hash',
    version: 'version',
    status: 'status',
    approvedAt: 'approved_at',
    createdAt: 'created_at',
  },
  tasks: { id: 'id', status: 'status' },
}))

import { createPlanTools } from './plan-tools'
import type { ToolContext } from './types'

function makeCtx(autonomyLevel: 'guided' | 'autonomous' | 'full'): ToolContext {
  return {
    taskId: 'task-1',
    userId: 'user-1',
    capabilityLevel: 'enhanced',
    autonomyLevel,
    accumulatedContext: '',
    subAgentResults: [],
    checkpoint: async () => 'ck',
    restore: async () => {},
  }
}

async function runCreatePlan(autonomyLevel: 'guided' | 'autonomous' | 'full') {
  const tools = createPlanTools(makeCtx(autonomyLevel))
  // The AI SDK Tool type marks execute as optional with a complex signature;
  // cast to a minimal callable shape for the test harness.
  const createPlanTool = tools.createPlan as unknown as { execute: (args: unknown) => Promise<string> }
  return createPlanTool.execute({
    objective: 'Build the feature',
    steps: [{ id: 's1', description: 'Step one' }],
  })
}

describe('createPlan autonomy behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.setMock.mockClear()
  })

  it('pauses the task for approval in guided mode (sets PLANNING_PENDING_APPROVAL)', async () => {
    const result = await runCreatePlan('guided')

    expect(result).toContain('paused until the user approves')
    // The set call inside the transaction must have been invoked
    expect(h.setMock).toHaveBeenCalled()
  })

  it('does NOT pause the task in full autonomy — plan is recorded, execution continues', async () => {
    const result = await runCreatePlan('full')

    expect(result).toContain('Continuing execution autonomously')
    expect(result).not.toContain('paused')
    // No status update (no PLANNING_PENDING_APPROVAL write)
    expect(h.setMock).not.toHaveBeenCalled()
  })

  it('records the plan without pausing in autonomous mode', async () => {
    const result = await runCreatePlan('autonomous')

    expect(result).toContain('Continuing execution autonomously')
    expect(h.setMock).not.toHaveBeenCalled()
  })
})
