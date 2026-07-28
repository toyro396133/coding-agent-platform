export type AgentState = 'Analyze' | 'Plan' | 'Execute' | 'Verify' | 'Done' | 'Error'

export interface TaskBudgets {
  maxSteps: number
  maxTimeMs: number
  maxTokens: number
  maxCostUsd?: number
}

export interface AgentContext {
  state: AgentState
  budgets: TaskBudgets
  startTime: number
  stepsCompleted: number
  tokensUsed: number
  costIncurred: number
  isCancelled: boolean
  cancelSignal?: AbortSignal
}

export interface AgentResult {
  status: 'completed' | 'failed' | 'cancelled' | 'budget_exceeded'
  finalState: AgentState
  stepsTaken: number
  totalTokens: number
  totalCost?: number
  error?: Error | string
  output?: string
}
