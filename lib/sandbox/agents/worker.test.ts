import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWorkerAgent, type WorkerAgentInput } from './worker'

// The generic fallback delegates to executeAgentInSandbox (dynamic import).
vi.mock('./index', () => ({
  executeAgentInSandbox: vi.fn().mockResolvedValue({
    success: true,
    agentResponse: 'done',
  }),
}))

const sandbox = {} as any

function makeWorker(overrides: Partial<WorkerAgentInput> = {}): WorkerAgentInput {
  return {
    id: 'w1',
    agentType: 'claude',
    instructions: 'do the thing',
    ...overrides,
  }
}

describe('runWorkerAgent (single adapter)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claude: fails fast when no API key is configured', async () => {
    const result = await runWorkerAgent(sandbox, makeWorker({ agentType: 'claude' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('AI_GATEWAY_API_KEY')
  })

  it('cursor: fails fast when no CURSOR_API_KEY', async () => {
    const result = await runWorkerAgent(sandbox, makeWorker({ agentType: 'cursor' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('CURSOR_API_KEY')
  })

  it('codex: fails fast when no AI_GATEWAY/OPENAI key', async () => {
    const result = await runWorkerAgent(sandbox, makeWorker({ agentType: 'codex' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('AI_GATEWAY_API_KEY')
  })

  it('gemini: fails fast when no GEMINI_API_KEY', async () => {
    const result = await runWorkerAgent(sandbox, makeWorker({ agentType: 'gemini' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('GEMINI_API_KEY')
  })

  it('generic fallback delegates to executeAgentInSandbox', async () => {
    const result = await runWorkerAgent(sandbox, makeWorker({ agentType: 'copilot' }))
    expect(result.success).toBe(true)
    const { executeAgentInSandbox } = await import('./index')
    // Intentional contract test: pins the exact executeAgentInSandbox
    // signature so a future refactor of the adapter fails loudly here.
    expect(executeAgentInSandbox).toHaveBeenCalledTimes(1)
    expect(executeAgentInSandbox).toHaveBeenCalledWith(
      sandbox,
      'do the thing',
      'copilot',
      expect.any(Object),
      undefined,
      [],
      undefined,
      undefined,
      false,
      undefined,
      'w1',
    )
  })
})
