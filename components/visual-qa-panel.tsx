'use client'

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ImageIcon,
  Loader2,
  RefreshCw,
  ScanSearch,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface VisualQaRunData {
  id: string
  taskId: string
  url: string
  prompt: string
  verdict: 'pass' | 'fail' | 'unknown'
  critique: string
  screenshotBase64: string
  createdAt: string
}

interface VisualQaPanelProps {
  taskId: string
  className?: string
  /** When true, polls for new runs while the panel is mounted. */
  active?: boolean
}

const VerdictBadge = ({ verdict }: { verdict: VisualQaRunData['verdict'] }) => {
  if (verdict === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        PASS
      </span>
    )
  }
  if (verdict === 'fail') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-red-500/30 bg-red-500/10 text-red-500">
        <XCircle className="h-3 w-3" />
        FAIL
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-500">
      <Clock className="h-3 w-3" />
      PENDING
    </span>
  )
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diffMin = Math.floor((now - date.getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  return date.toLocaleDateString()
}

function urlHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function fetchVisualQaRuns(taskId: string): Promise<VisualQaRunData[] | null> {
  try {
    const response = await fetch(`/api/tasks/${taskId}/visual-qa`)
    if (response.ok) {
      const data = await response.json()
      if (Array.isArray(data.runs)) {
        return data.runs
      }
    }
  } catch (_error) {
    console.error('Failed to fetch visual QA runs')
  }
  return null
}

export function VisualQaPanel({ taskId, className, active = false }: VisualQaPanelProps) {
  const [runs, setRuns] = useState<VisualQaRunData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const runs = await fetchVisualQaRuns(taskId)
      if (!cancelled) {
        if (runs) setRuns(runs)
        setIsLoading(false)
      }
    }
    load()
    const interval = active
      ? setInterval(() => {
          load()
        }, 8000)
      : null
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [taskId, active])

  const refresh = async () => {
    setIsLoading(true)
    const runs = await fetchVisualQaRuns(taskId)
    if (runs) setRuns(runs)
    setIsLoading(false)
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const latest = runs[0]

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 flex-shrink-0">
        <ScanSearch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Visual QA ({runs.length})</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          className="h-6 w-6 p-0 ml-auto flex-shrink-0"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {isLoading && runs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No visual QA runs yet</p>
          <p className="text-xs text-muted-foreground/60 max-w-[220px]">
            Ask the agent to use visualQaCritique or visualQaLoop after UI changes to capture screenshots and reviews
            here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Latest run — full detail */}
          {latest && (
            <div className="p-3">
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Screenshot */}
                <div className="relative bg-black/40">
                  <img
                    src={`data:image/jpeg;base64,${latest.screenshotBase64}`}
                    alt={`Visual QA screenshot of ${latest.url}`}
                    className="w-full h-auto max-h-[340px] object-contain"
                    loading="lazy"
                  />
                </div>
                {/* Meta */}
                <div className="px-3 py-2 border-t flex items-center gap-2 bg-muted/30">
                  <VerdictBadge verdict={latest.verdict} />
                  <span className="text-[10px] text-muted-foreground truncate">{urlHost(latest.url)}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
                    {formatTime(latest.createdAt)}
                  </span>
                </div>
                {/* Critique */}
                <div className="px-3 py-2">
                  <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto">
                    {latest.critique}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {runs.length > 1 && (
            <div className="px-3 pb-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground/60 px-1 pt-1">History</p>
              {runs.slice(1).map((run) => (
                <div
                  key={run.id}
                  className={cn(
                    'rounded-md border transition-all duration-200',
                    run.verdict === 'pass' && 'border-emerald-500/20 bg-emerald-500/5',
                    run.verdict === 'fail' && 'border-red-500/20 bg-red-500/5',
                    run.verdict === 'unknown' && 'border-amber-500/20 bg-amber-500/5',
                  )}
                >
                  <button
                    onClick={() => toggleExpand(run.id)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left"
                  >
                    <VerdictBadge verdict={run.verdict} />
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{urlHost(run.url)}</span>
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                      {formatTime(run.createdAt)}
                    </span>
                    {expandedId === run.id ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                  {expandedId === run.id && (
                    <div className="px-2.5 pb-2 space-y-2">
                      <img
                        src={`data:image/jpeg;base64,${run.screenshotBase64}`}
                        alt={`Visual QA screenshot of ${run.url}`}
                        className="w-full h-auto max-h-[260px] object-contain rounded border border-border"
                        loading="lazy"
                      />
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {run.critique}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
