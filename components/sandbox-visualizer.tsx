'use client'

import { AlertTriangle, CheckCircle2, Clock, FileCode, Layers, Loader2, Server, Timer, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────

export interface SandboxVisualizerWorker {
  id: string
  role: string
  agentType: string
  model: string
  status: 'creating' | 'running' | 'completed' | 'failed' | 'timeout' | 'pending'
  sandboxId?: string
  durationMs?: number
  changedFiles?: string[]
  error?: string
  startedAt?: number
}

export interface SandboxVisualizerData {
  workers: SandboxVisualizerWorker[]
  totalDurationMs?: number
  mergedPatchSize?: number
  mergeConflicts?: { file: string; error: string }[]
  overallStatus: 'idle' | 'deploying' | 'running' | 'completed' | 'failed' | 'partial'
  /** Per-worker log entries from the worker-status endpoint */
  workerLogs?: Record<string, unknown[]>
}

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

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-500'
    case 'failed':
      return 'text-red-500'
    case 'timeout':
      return 'text-amber-500'
    case 'running':
      return 'text-blue-500'
    case 'creating':
      return 'text-violet-500'
    case 'pending':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function statusIcon(status: string, className?: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={cn('h-4 w-4', className)} />
    case 'failed':
      return <XCircle className={cn('h-4 w-4', className)} />
    case 'timeout':
      return <AlertTriangle className={cn('h-4 w-4', className)} />
    case 'running':
      return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
    case 'creating':
      return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
    case 'pending':
      return <Clock className={cn('h-4 w-4', className)} />
    default:
      return <Server className={cn('h-4 w-4', className)} />
  }
}

// ─── Simulated live progress ───────────────────────────────────────────

function useLiveProgress(worker: SandboxVisualizerWorker): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (worker.status !== 'running' && worker.status !== 'creating') {
      setProgress(worker.status === 'completed' ? 100 : 0)
      return
    }

    // Simulate progress: start at 10%, climb to 90% over time
    const startTime = worker.startedAt || Date.now()
    const elapsed = Date.now() - startTime
    const initial = Math.min(10, Math.floor(elapsed / 1000) * 3)

    setProgress(Math.min(initial, 85))

    const interval = setInterval(() => {
      const nowElapsed = Date.now() - startTime
      // Non-linear: fast at first, slower as it goes
      const pct = Math.min(85, Math.floor(Math.log(1 + nowElapsed / 1000) * 12))
      setProgress(pct)
    }, 2000)

    return () => clearInterval(interval)
  }, [worker.status, worker.startedAt])

  return progress
}

// ─── Component ──────────────────────────────────────────────────────────

interface SandboxVisualizerProps {
  data: SandboxVisualizerData
  /** Poll for live updates from an API endpoint */
  pollUrl?: string
  /** Poll interval in ms */
  pollInterval?: number
  /** Compact mode for embedding */
  compact?: boolean
  /** Callback when a worker is clicked */
  onWorkerClick?: (workerId: string) => void
}

export function SandboxVisualizer({
  data,
  pollUrl,
  pollInterval = 3000,
  compact = false,
  onWorkerClick,
}: SandboxVisualizerProps) {
  const [liveData, setLiveData] = useState(data)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll for live updates
  useEffect(() => {
    if (!pollUrl || data.overallStatus === 'completed' || data.overallStatus === 'failed') {
      return
    }

    const poll = async () => {
      try {
        const response = await fetch(pollUrl)
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            setLiveData(result.data)
            setError(null)
          }
        }
      } catch {
        // Silent — polling is best-effort
      }
    }

    // Initial poll
    poll()

    pollingRef.current = setInterval(poll, pollInterval)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [pollUrl, pollInterval, data.overallStatus])

  // Sync when data prop changes
  useEffect(() => {
    setLiveData(data)
  }, [data])

  const displayData = pollUrl ? liveData : data
  const activeCount = displayData.workers.filter((w) => w.status === 'running' || w.status === 'creating').length
  const doneCount = displayData.workers.filter((w) => w.status === 'completed').length
  const failCount = displayData.workers.filter((w) => w.status === 'failed' || w.status === 'timeout').length
  const _pendingCount = displayData.workers.length - activeCount - doneCount - failCount
  const overallProgress =
    displayData.workers.length > 0 ? Math.round(((doneCount + failCount) / displayData.workers.length) * 100) : 0

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {/* Overall status bar */}
      {displayData.workers.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              <span>
                {displayData.workers.length} worker{displayData.workers.length > 1 ? 's' : ''}
              </span>
              {activeCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 animate-pulse">
                  {activeCount} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {doneCount > 0 && <span className="text-emerald-500">{doneCount} done</span>}
              {failCount > 0 && <span className="text-red-500">{failCount} failed</span>}
              {displayData.totalDurationMs && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {formatDuration(displayData.totalDurationMs)}
                </span>
              )}
            </div>
          </div>
          <Progress value={overallProgress} className="h-1.5" />
        </div>
      )}

      {/* Worker list */}
      <div className={cn('space-y-1.5', compact && 'space-y-1')}>
        {displayData.workers.map((worker) => (
          <WorkerCard
            key={worker.id}
            worker={worker}
            compact={compact}
            onClick={onWorkerClick ? () => onWorkerClick(worker.id) : undefined}
          />
        ))}
      </div>

      {/* Merge conflicts */}
      {displayData.mergeConflicts && displayData.mergeConflicts.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Merge Conflicts
            </div>
            <div className="space-y-0.5">
              {displayData.mergeConflicts.map((conflict) => (
                <div key={conflict.file} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileCode className="h-3 w-3" />
                  <span className="font-mono">{conflict.file}</span>
                  <span className="text-muted-foreground/60">— {conflict.error}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Polling error */}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Worker Card ────────────────────────────────────────────────────────

function WorkerCard({
  worker,
  compact,
  onClick,
}: {
  worker: SandboxVisualizerWorker
  compact: boolean
  onClick?: () => void
}) {
  const AgentIcon = AGENT_ICONS[worker.agentType]
  const progress = useLiveProgress(worker)
  const isActive = worker.status === 'running' || worker.status === 'creating'

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200',
        isActive ? 'border-primary/20 bg-accent/30' : 'border-border/50',
        onClick ? 'cursor-pointer hover:bg-accent/50' : '',
      )}
      onClick={onClick}
    >
      {/* Status indicator */}
      <div className={cn('shrink-0', statusColor(worker.status))}>{statusIcon(worker.status)}</div>

      {/* Agent icon */}
      {AgentIcon ? (
        <AgentIcon className="h-5 w-5 shrink-0" />
      ) : (
        <Server className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{worker.role || `${worker.agentType} worker`}</span>
          {!compact && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
              {worker.agentType}
            </Badge>
          )}
          {!compact && worker.status === 'completed' && worker.durationMs && (
            <span className="text-[10px] text-muted-foreground shrink-0">{formatDuration(worker.durationMs)}</span>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{worker.model}</span>
            {worker.sandboxId && (
              <span className="font-mono text-[10px] text-muted-foreground/50">{worker.sandboxId.slice(0, 12)}</span>
            )}
          </div>
        )}
        {/* Changed files summary */}
        {worker.changedFiles && worker.changedFiles.length > 0 && !compact && (
          <div className="flex items-center gap-1 mt-0.5">
            <Badge variant="secondary" className="text-[10px] h-4 px-1 gap-0.5">
              <FileCode className="h-2.5 w-2.5" />
              {worker.changedFiles.length} file{worker.changedFiles.length > 1 ? 's' : ''}
            </Badge>
            {worker.changedFiles.slice(0, 2).map((f) => (
              <span key={f} className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[100px]">
                {f.split('/').pop()}
              </span>
            ))}
          </div>
        )}
        {/* Error */}
        {worker.error && !compact && <p className="text-xs text-red-500 mt-0.5 truncate">{worker.error}</p>}
        {/* Progress bar for active workers */}
        {isActive && (
          <div className="mt-1.5">
            <Progress value={progress} className="h-1" />
          </div>
        )}
      </div>

      {/* Status badge */}
      <Badge variant="secondary" className={cn('text-[10px] h-4 px-1.5 shrink-0', statusColor(worker.status))}>
        {worker.status}
      </Badge>
    </div>
  )
}
