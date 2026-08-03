import type { LogEntry, Task } from '@/lib/db/schema'
import type { AutonomyLevel, CapabilityLevel, ToolContext } from './capabilities/types'
import type { DaemonAgentStatus } from './worker/types'

export interface SubAgentResult {
  type: string
  prompt: string
  result: string
}

export interface OrchestratorResult {
  finalAnswer: string
  steps: number
  subAgentResults: SubAgentResult[]
  daemonAgents: DaemonAgentStatus[]
  paused?: boolean
}

export interface AgentTeamMember {
  role: string
  specialty: string
  model: string
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
  public userId: string = ''
  public capabilityLevel: CapabilityLevel = 'basic'
  public autonomyLevel: AutonomyLevel = 'full'
  public toolContext: ToolContext | null = null
  public agentTeam: AgentTeamMember[] = []
  public daemonAgents: DaemonAgentStatus[] = []
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
    this.setCapabilityContext(level, userId, this.autonomyLevel)
  }

  setCapabilityContext(level: CapabilityLevel, userId: string, autonomyLevel: AutonomyLevel): void {
    this.capabilityLevel = level
    this.autonomyLevel = autonomyLevel
    const self = this
    this.toolContext = {
      taskId: this.taskId,
      userId,
      capabilityLevel: level,
      autonomyLevel,
      get accumulatedContext() {
        return self.accumulatedContext
      },
      get subAgentResults() {
        return self.subAgentResults
      },
      checkpoint: async (_label: string) => {
        const id = `ck-${Date.now().toString(36)}`
        self.saveCheckpoint()
        return id
      },
      restore: async (_id: string) => {
        self.saveCheckpoint()
      },
    }
  }

  addSubAgentResult(type: string, prompt: string, result: string): void {
    this.subAgentResults.push({ type, prompt, result })
  }

  addDaemonAgent(agent: DaemonAgentStatus): void {
    const existing = this.daemonAgents.find((a) => a.id === agent.id)
    if (existing) {
      Object.assign(existing, agent)
    } else {
      this.daemonAgents.push(agent)
    }
  }

  removeDaemonAgent(id: string): void {
    this.daemonAgents = this.daemonAgents.filter((a) => a.id !== id)
  }

  getDaemonAgent(id: string): DaemonAgentStatus | undefined {
    return this.daemonAgents.find((a) => a.id === id)
  }

  appendContext(context: string): void {
    this.accumulatedContext += `${context}\n`
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
      daemonAgents: this.daemonAgents,
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
