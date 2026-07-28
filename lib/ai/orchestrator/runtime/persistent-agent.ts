export interface PersistentAgentConfig {
  taskId: string
  agent: string
  model: string
  intervalMs: number
  maxRuns: number
  onResult?: (result: PersistentRunResult) => void
}

export interface PersistentRunResult {
  taskId: string
  runNumber: number
  success: boolean
  output: string
  timestamp: number
}

const activePersistentAgents = new Map<
  string,
  { config: PersistentAgentConfig; timer: ReturnType<typeof setInterval>; runs: number }
>()

export function startPersistentAgent(config: PersistentAgentConfig): boolean {
  if (activePersistentAgents.has(config.taskId)) {
    return false
  }

  let runs = 0
  const timer = setInterval(async () => {
    // Get the current entry to update its runs count
    const entry = activePersistentAgents.get(config.taskId)
    if (!entry) return

    // Increment and update the map entry's runs value
    runs++
    entry.runs = runs

    try {
      const result: PersistentRunResult = {
        taskId: config.taskId,
        runNumber: runs,
        success: true,
        output: 'Agent run completed',
        timestamp: Date.now(),
      }
      config.onResult?.(result)
    } catch (error) {
      const result: PersistentRunResult = {
        taskId: config.taskId,
        runNumber: runs,
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }
      config.onResult?.(result)
    }

    // Check maxRuns limit AFTER allowing this run to execute
    if (runs >= config.maxRuns) {
      stopPersistentAgent(config.taskId)
    }
  }, config.intervalMs)

  activePersistentAgents.set(config.taskId, { config, timer, runs: 0 })
  return true
}

export function stopPersistentAgent(taskId: string): boolean {
  const entry = activePersistentAgents.get(taskId)
  if (!entry) return false

  clearInterval(entry.timer)
  activePersistentAgents.delete(taskId)
  return true
}

export function getPersistentAgentStatus(taskId: string): {
  running: boolean
  runs: number
  config?: PersistentAgentConfig
} {
  const entry = activePersistentAgents.get(taskId)
  if (!entry) {
    return { running: false, runs: 0 }
  }
  return { running: true, runs: entry.runs, config: entry.config }
}

export function listActivePersistentAgents(): Array<{ taskId: string; config: PersistentAgentConfig; runs: number }> {
  return Array.from(activePersistentAgents.entries()).map(([taskId, entry]) => ({
    taskId,
    config: entry.config,
    runs: entry.runs,
  }))
}
