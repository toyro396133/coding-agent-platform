'use client'

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  FileCode,
  Loader2,
  MessageSquare,
  Terminal,
  Timer,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import type { SandboxVisualizerData, SandboxVisualizerWorker } from '@/components/sandbox-visualizer'
import { Badge } from '@/components/ui/badge'
import type { LogEntry, Task } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

// ─── Agent icon map ─────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  claude: Claude,
  codex: Codex,
  copilot: Copilot,
  cursor: Cursor,
  gemini: Gemini,
  opencode: OpenCode,
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    case 'failed':
      return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
    case 'timeout':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
    case 'running':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 animate-pulse'
    case 'creating':
      return 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
    case 'pending':
      return 'bg-muted text-muted-foreground border-border/50'
    default:
      return 'bg-muted text-muted-foreground border-border/50'
  }
}

function statusIcon(status: string, className?: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={cn('h-3.5 w-3.5', className)} />
    case 'failed':
      return <XCircle className={cn('h-3.5 w-3.5', className)} />
    case 'timeout':
      return <AlertTriangle className={cn('h-3.5 w-3.5', className)} />
    case 'running':
      return <Loader2 className={cn('h-3.5 w-3.5 animate-spin', className)} />
    case 'creating':
      return <Loader2 className={cn('h-3.5 w-3.5 animate-spin', className)} />
    case 'pending':
      return <Clock className={cn('h-3.5 w-3.5', className)} />
    default:
      return <Clock className={cn('h-3.5 w-3.5', className)} />
  }
}

function formatLogTime(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getLogColor(type: LogEntry['type']): string {
  switch (type) {
    case 'command':
      return 'text-cyan-400'
    case 'error':
      return 'text-red-400'
    case 'success':
      return 'text-emerald-400'
    default:
      return 'text-white/80'
  }
}

// ─── Worker Log Entry ───────────────────────────────────────────────────

function extractWorkerName(logMessage: string): string | null {
  // Match [WORKER:role] at the start of the message
  const match = logMessage.match(/^\[WORKER:([^\]]+)\]/)
  return match ? match[1].trim() : null
}

function stripWorkerPrefix(logMessage: string): string {
  return logMessage.replace(/^\[WORKER:[^\]]+\]\s*/, '')
}

// ─── Props ──────────────────────────────────────────────────────────────

interface WorkerLogTabsProps {
  task: Task
  /** Live worker status data from polling */
  workerStatusData?: SandboxVisualizerData | null
  /** Current task status for deriving worker states */
  currentStatus: Task['status']
}

// ─── Component ──────────────────────────────────────────────────────────

export function WorkerLogTabs({ task, workerStatusData, currentStatus }: WorkerLogTabsProps) {
  const [activeWorkerId, setActiveWorkerId] = useState<string | null>(null)
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(new Set())
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const [liveWorkerStatus, setLiveWorkerStatus] = useState<SandboxVisualizerData | null>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = useRef<Record<string, number>>({})

  // Determine if workers are configured (must be after all hooks)
  const wc = task.workerTeamConfig
  const hasWorkers = wc?.workers && wc.workers.length > 0
  const workers = hasWorkers ? wc.workers : []

  // All hooks called unconditionally
  useEffect(() => {
    if (workers.length > 0 && !activeWorkerId) {
      setActiveWorkerId(workers[0].id)
    }
  }, [workers, activeWorkerId])

  // Internal polling for live worker status and logs
  useEffect(() => {
    if (!hasWorkers || currentStatus === 'completed' || currentStatus === 'error' || currentStatus === 'stopped') {
      return
    }

    const poll = async () => {
      try {
        const response = await fetch(`/api/tasks/${task.id}/worker-status`)
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            setLiveWorkerStatus(result.data)
          }
        }
      } catch {
        // Best-effort polling
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [task.id, hasWorkers, currentStatus])

  // Combine external data with live polled data
  const mergedStatusData = liveWorkerStatus || workerStatusData

  useEffect(() => {
    if (!activeWorkerId || !logsContainerRef.current) return
    const actWorker = workers.find((w) => w.id === activeWorkerId)
    if (!actWorker) return

    const workerLogs = getWorkerLogs(actWorker.role || actWorker.agentType)
    const prevLength = prevLogsLengthRef.current[activeWorkerId] || 0

    if (workerLogs.length > prevLength && workerLogs.length > 0) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }

    prevLogsLengthRef.current[activeWorkerId] = workerLogs.length
  }, [activeWorkerId, workers, task.logs])

  // Early return if no workers (after all hooks)
  if (!hasWorkers) return null

  const activeWorker = workers.find((w) => w.id === activeWorkerId)

  // Deduce worker statuses from task status + polled data
  const getWorkerStatus = (workerId: string): SandboxVisualizerWorker['status'] => {
    if (mergedStatusData) {
      const found = mergedStatusData.workers.find((w) => w.id === workerId)
      if (found) return found.status
    }
    if (workerStatusData) {
      const found = workerStatusData.workers.find((w) => w.id === workerId)
      if (found) return found.status
    }
    switch (currentStatus) {
      case 'processing':
        return 'running'
      case 'completed':
        return 'completed'
      case 'error':
        return 'failed'
      case 'stopped':
        return 'timeout'
      default:
        return 'pending'
    }
  }

  const getWorkerError = (workerId: string): string | undefined => {
    if (mergedStatusData) {
      const found = mergedStatusData.workers.find((w) => w.id === workerId)
      if (found?.error) return found.error
    }
    if (workerStatusData) {
      const found = workerStatusData.workers.find((w) => w.id === workerId)
      if (found?.error) return found.error
    }
    return undefined
  }

  const getWorkerChangedFiles = (workerId: string): string[] | undefined => {
    if (mergedStatusData) {
      const found = mergedStatusData.workers.find((w) => w.id === workerId)
      if (found?.changedFiles) return found.changedFiles
    }
    if (workerStatusData) {
      const found = workerStatusData.workers.find((w) => w.id === workerId)
      if (found?.changedFiles) return found.changedFiles
    }
    return undefined
  }

  const getWorkerLogs = (workerName: string): LogEntry[] => {
    // First try polled data for live logs
    if (mergedStatusData && mergedStatusData.workerLogs) {
      const polledLogs = mergedStatusData.workerLogs[workerName]
      if (polledLogs && polledLogs.length > 0) {
        return polledLogs as LogEntry[]
      }
    }
    // Fall back to task.logs from props
    return (task.logs || []).filter((log) => {
      const workerNameFromLog = extractWorkerName(log.message)
      return workerNameFromLog === workerName
    })
  }

  return (
    <div className="w-full border rounded-lg overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b bg-muted/30 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {workers.map((worker) => {
          const isActive = worker.id === activeWorkerId
          const status = getWorkerStatus(worker.id)
          const AgentIcon = AGENT_ICONS[worker.agentType]

          return (
            <button
              key={worker.id}
              onClick={() => setActiveWorkerId(worker.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-r border-border/50 transition-colors',
                isActive
                  ? 'bg-background text-foreground border-b-2 border-b-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <span
                className={cn(
                  'shrink-0',
                  status === 'failed' && 'text-red-500',
                  status === 'completed' && 'text-emerald-500',
                )}
              >
                {statusIcon(status, 'h-3 w-3')}
              </span>
              {AgentIcon ? <AgentIcon className="h-3.5 w-3.5 shrink-0" /> : null}
              <span className="truncate max-w-[100px]">{worker.role || worker.agentType}</span>
              <Badge
                variant="outline"
                className={cn('text-[10px] h-3.5 px-1 shrink-0 border', statusBadgeColor(status))}
              >
                {status}
              </Badge>
            </button>
          )
        })}
      </div>

      {/* Active worker content */}
      {activeWorker && (
        <div className="p-3 space-y-3">
          {/* Worker info header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {(() => {
                const AgentIcon = AGENT_ICONS[activeWorker.agentType]
                return AgentIcon ? (
                  <div className="h-8 w-8 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
                    <AgentIcon className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                  </div>
                )
              })()}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{activeWorker.role || `${activeWorker.agentType} worker`}</h4>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                    {activeWorker.agentType}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{activeWorker.model}</span>
                  {getWorkerStatus(activeWorker.id) === 'completed' && (
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {formatDuration(workerStatusData?.workers.find((w) => w.id === activeWorker.id)?.durationMs)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn('text-xs h-5 px-2 shrink-0 border', statusBadgeColor(getWorkerStatus(activeWorker.id)))}
            >
              <span className="flex items-center gap-1">
                {statusIcon(getWorkerStatus(activeWorker.id), 'h-3 w-3')}
                {getWorkerStatus(activeWorker.id)}
              </span>
            </Badge>
          </div>

          {/* Changed files summary */}
          {(() => {
            const files = getWorkerChangedFiles(activeWorker.id)
            if (!files || files.length === 0) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground shrink-0">Files changed:</span>
                {files.slice(0, 5).map((f) => (
                  <Badge key={f} variant="secondary" className="text-[10px] h-5 px-1.5 font-mono gap-1">
                    <FileCode className="h-2.5 w-2.5" />
                    {f.split('/').pop()}
                  </Badge>
                ))}
                {files.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">+{files.length - 5} more</span>
                )}
              </div>
            )
          })()}

          {/* Instructions (collapsible) */}
          <div>
            <button
              onClick={() => {
                setExpandedInstructions((prev) => {
                  const next = new Set(prev)
                  if (next.has(activeWorker.id)) next.delete(activeWorker.id)
                  else next.add(activeWorker.id)
                  return next
                })
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expandedInstructions.has(activeWorker.id) ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Code className="h-3 w-3" />
              Instructions
            </button>
            {expandedInstructions.has(activeWorker.id) && (
              <div className="mt-1.5 p-2 rounded bg-accent/30 text-xs text-muted-foreground font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                {activeWorker.instructions}
              </div>
            )}
          </div>

          {/* Error display */}
          {(() => {
            const error = getWorkerError(activeWorker.id)
            if (!error) return null
            return (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
                <button
                  onClick={() => {
                    setExpandedErrors((prev) => {
                      const next = new Set(prev)
                      if (next.has(activeWorker.id)) next.delete(activeWorker.id)
                      else next.add(activeWorker.id)
                      return next
                    })
                  }}
                  className="flex items-center gap-1.5 w-full"
                >
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">Error</span>
                  <span className="text-[10px] text-red-500/70 truncate flex-1 text-left">
                    {expandedErrors.has(activeWorker.id) ? '' : error}
                  </span>
                  {expandedErrors.has(activeWorker.id) ? (
                    <ChevronDown className="h-3 w-3 text-red-500 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-red-500 shrink-0" />
                  )}
                </button>
                {expandedErrors.has(activeWorker.id) && (
                  <div className="mt-1.5 p-2 rounded bg-black/40 text-xs font-mono text-red-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {error}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Worker logs */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Terminal className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Worker Logs</span>
              <span className="text-[10px] text-muted-foreground/60">
                ({getWorkerLogs(activeWorker.role || activeWorker.agentType).length} entries)
              </span>
            </div>
            <div
              ref={logsContainerRef}
              className="bg-black/80 rounded-lg p-2 font-mono text-xs max-h-48 overflow-y-auto space-y-0.5"
            >
              {(() => {
                const workerLogs = getWorkerLogs(activeWorker.role || activeWorker.agentType)
                if (workerLogs.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-6 text-muted-foreground/50">
                      <div className="text-center">
                        <MessageSquare className="h-5 w-5 mx-auto mb-1 opacity-50" />
                        <p className="text-[10px]">
                          {currentStatus === 'processing'
                            ? 'Waiting for worker logs...'
                            : 'No logs recorded for this worker'}
                        </p>
                      </div>
                    </div>
                  )
                }
                return workerLogs.map((log, i) => (
                  <div key={i} className="flex gap-1.5 leading-tight hover:bg-white/5 px-1 py-0.5 rounded">
                    <span className="text-white/30 text-[10px] shrink-0 w-[60px] text-right">
                      {formatLogTime(log.timestamp || new Date())}
                    </span>
                    <span className={cn('flex-1', getLogColor(log.type))}>{stripWorkerPrefix(log.message)}</span>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Pending workers info */}
          {currentStatus === 'processing' && getWorkerStatus(activeWorker.id) === 'pending' && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Worker sandbox is being prepared...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
