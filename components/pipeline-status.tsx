'use client'

import { CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, SkipForward, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PipelineStageData } from '@/lib/types/pipeline'
import { cn } from '@/lib/utils'

interface PipelineStatusProps {
  stages: PipelineStageData[]
  totalDuration?: number
  compact?: boolean
  onRetry?: (stage: string) => void
  className?: string
}

const StageIcon = ({ status }: { status: PipelineStageData['status'] }) => {
  switch (status) {
    case 'passed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-muted-foreground" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground/50" />
  }
}

const StageColor = {
  passed: 'border-emerald-500/30 bg-emerald-500/5',
  failed: 'border-red-500/30 bg-red-500/5',
  running: 'border-blue-500/30 bg-blue-500/5',
  skipped: 'border-muted/30 bg-muted/5',
  pending: 'border-muted/10 bg-transparent',
}

export function PipelineStatus({ stages, totalDuration, compact = false, onRetry, className }: PipelineStatusProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    // Animate in stages one by one
    const timer = setTimeout(() => setAnimateIn(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const passedCount = stages.filter((s) => s.status === 'passed').length
  const failedCount = stages.filter((s) => s.status === 'failed').length
  const skippedCount = stages.filter((s) => s.status === 'skipped').length
  const isRunning = stages.some((s) => s.status === 'running')
  const isAllDone = stages.every((s) => s.status !== 'pending' && s.status !== 'running')

  if (compact && isAllDone) {
    // Compact summary mode
    return (
      <div className={cn('flex items-center gap-2 text-xs', className)}>
        {failedCount > 0 ? (
          <span className="flex items-center gap-1 text-red-500">
            <XCircle className="h-3 w-3" />
            {failedCount} failed
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            {passedCount}/{stages.length} passed
          </span>
        )}
        {skippedCount > 0 && <span className="text-muted-foreground">({skippedCount} skipped)</span>}
        {totalDuration && <span className="text-muted-foreground">· {(totalDuration / 1000).toFixed(1)}s</span>}
      </div>
    )
  }

  return (
    <div className={cn('space-y-1', className)}>
      {/* Pipeline header */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {isRunning ? 'Pipeline Running...' : isAllDone ? 'Pipeline Complete' : 'Pipeline'}
          </span>
          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={failedCount > 0 ? 'text-red-500' : 'text-emerald-500'}>
            {passedCount}/{stages.length}
          </span>
          {totalDuration && <span>· {(totalDuration / 1000).toFixed(1)}s</span>}
        </div>
      </div>

      {/* Stages */}
      <div className="space-y-0.5">
        {stages.map((stage, index) => (
          <div
            key={stage.name}
            className={cn(
              'border rounded-md transition-all duration-500',
              StageColor[stage.status],
              animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
              stage.error && 'border-red-500/50',
            )}
            style={{
              transitionDelay: `${index * 100}ms`,
            }}
          >
            <button
              onClick={() => setExpandedStage(expandedStage === stage.name ? null : stage.name)}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-start"
            >
              <StageIcon status={stage.status} />
              <span
                className={cn(
                  'text-xs flex-1',
                  stage.status === 'failed' && 'text-red-500 font-medium',
                  stage.status === 'passed' && 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {stage.name}
              </span>
              {stage.duration && (
                <span className="text-[10px] text-muted-foreground">{(stage.duration / 1000).toFixed(1)}s</span>
              )}
              {(stage.error || stage.output) &&
                (expandedStage === stage.name ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground rtl:rotate-180" />
                ))}
              {stage.status === 'failed' && onRetry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetry(stage.name)
                  }}
                  className="text-[10px] text-blue-500 hover:text-blue-600 hover:underline"
                >
                  Retry
                </button>
              )}
            </button>

            {/* Expandable error/output details */}
            {expandedStage === stage.name && (stage.error || stage.output) && (
              <div className="px-2.5 pb-2">
                {stage.error && (
                  <pre className="text-[10px] text-red-500 bg-red-500/5 rounded p-1.5 overflow-x-auto max-h-24 overflow-y-auto">
                    {stage.error.slice(0, 1000)}
                  </pre>
                )}
                {stage.output && !stage.error && (
                  <pre className="text-[10px] text-muted-foreground bg-muted/5 rounded p-1.5 overflow-x-auto max-h-24 overflow-y-auto">
                    {stage.output.slice(0, 1000)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Small inline badge showing pipeline status for the task list.
 */
export function PipelineBadge({ stages, className }: { stages: PipelineStageData[]; className?: string }) {
  const failed = stages.filter((s) => s.status === 'failed').length
  const passed = stages.filter((s) => s.status === 'passed').length

  if (failed > 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-[10px] text-red-500', className)}
        title={`${failed} stage(s) failed`}
      >
        <XCircle className="h-2.5 w-2.5" />
        {failed}
      </span>
    )
  }

  if (passed > 0) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-[10px] text-emerald-500', className)}
        title="All pipeline stages passed"
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
      </span>
    )
  }

  return null
}
