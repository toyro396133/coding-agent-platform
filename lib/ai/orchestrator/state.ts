import type { Task, LogEntry } from '@/lib/db/schema'

export interface SubAgentResult {
  type: string
  prompt: string
  result: string
}

export interface OrchestratorResult {
  finalAnswer: string
  steps: number
  subAgentResults: SubAgentResult[]
}

export class OrchestratorState {
  public steps = 0
  public maxSteps: number
  public currentPrompt: string
  public accumulatedContext = ''
  public completed = false
  public subAgentResults: SubAgentResult[] = []
  public taskId: string
  private checkpointFrequency: number
  private task: Task | null = null
  private logs: LogEntry[] = []

  constructor(taskId: string, initialPrompt: string, maxSteps = 20, checkpointFrequency = 5) {
    this.taskId = taskId
    this.currentPrompt = initialPrompt
    this.maxSteps = maxSteps
    this.checkpointFrequency = checkpointFrequency
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
