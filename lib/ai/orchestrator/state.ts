import type { Task, LogEntry } from '@/lib/db/schema'
import type { CapabilityLevel, ToolContext } from './capabilities/types'

export interface SubAgentResult {
  type: string
  prompt: string
  result: string
}

export interface OrchestratorResult {
  finalAnswer: string
  steps: number
  subAgentResults: SubAgentResult[]
  paused?: boolean
}

export class OrchestratorState {
  public steps = 0
  public maxSteps: number
  public currentPrompt: string
  public accumulatedContext = ''
  public completed = false
  public paused = false
  public subAgentResults: SubAgentResult[] = []
  public taskId: string
  public capabilityLevel: CapabilityLevel = 'basic'
  public toolContext: ToolContext | null = null
  private checkpointFrequency: number
  private task: Task | null = null
  private logs: LogEntry[] = []

  constructor(taskId: string, initialPrompt: string, maxSteps = 20, checkpointFrequency = 5) {
    this.taskId = taskId
    this.currentPrompt = initialPrompt
    this.maxSteps = maxSteps
    this.checkpointFrequency = checkpointFrequency
  }

  setCapabilityLevel(level: CapabilityLevel, userId: string): void {
    this.capabilityLevel = level
    const self = this
    this.toolContext = {
      taskId: this.taskId,
      userId,
      capabilityLevel: level,
      get accumulatedContext() {
        return self.accumulatedContext
      },
      get subAgentResults() {
        return self.subAgentResults
      },
      checkpoint: async (label: string) => {
        const id = `ck-${Date.now().toString(36)}`
        self.saveCheckpoint()
        return id
      },
      restore: async (id: string) => {
        self.saveCheckpoint()
      },
    }
  }

  addSubAgentResult(type: string, prompt: string, result: string): void {
    this.subAgentResults.push({ type, prompt, result })
  }

  appendContext(context: string): void {
    this.accumulatedContext += context + '\n'
  }

  markCompleted(): void {
    this.completed = true
  }

  shouldCheckpoint(): boolean {
    return this.steps > 0 && this.steps % this.checkpointFrequency === 0
  }

  saveCheckpoint(): void {
    this.logs.push({
      type: 'info',
      message: 'Checkpoint saved',
      timestamp: new Date(),
    })
  }

  getResult(): OrchestratorResult {
    return {
      finalAnswer: this.accumulatedContext || this.currentPrompt,
      steps: this.steps,
      subAgentResults: this.subAgentResults,
      paused: this.paused,
    }
  }

  setTask(task: Task): void {
    this.task = task
  }

  getTask(): Task | null {
    return this.task
  }

  addLog(entry: LogEntry): void {
    this.logs.push(entry)
  }

  getLogs(): LogEntry[] {
    return this.logs
  }
}
