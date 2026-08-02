'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronRight,
  Clock,
  GitCommit,
  FilePlus,
  FileMinus,
  FileEdit,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface CheckpointViewerData {
  id: string
  label: string
  description: string
  timestamp: string
  status: 'active' | 'accepted' | 'rejected' | 'rolled_back'
  changedFiles: string[]
  addedFiles: string[]
  deletedFiles: string[]
  metadata?: {
    agent?: string
    model?: string
    stage?: string
  }
}

interface CheckpointViewerProps {
  checkpoints: CheckpointViewerData[]
  onAccept?: (checkpointId: string) => void
  onReject?: (checkpointId: string) => void
  onRollback?: (checkpointId: string) => void
  onViewDiff?: (checkpointId: string) => void
  className?: string
  compact?: boolean
}

const StatusIcon = ({ status }: { status: CheckpointViewerData['status'] }) => {
  switch (status) {
    case 'accepted':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'rejected':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'rolled_back':
      return <RotateCcw className="h-4 w-4 text-amber-500" />
    default:
      return <Clock className="h-4 w-4 text-blue-500" />
  }
}

const ChangeBadge = ({ type, count }: { type: 'added' | 'changed' | 'deleted'; count: number }) => {
  if (count === 0) return null

  const colors = {
    added: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10',
    changed: 'text-amber-500 border-amber-500/20 bg-amber-500/10',
    deleted: 'text-red-500 border-red-500/20 bg-red-500/10',
  }

  const icons = {
    added: <FilePlus className="h-3 w-3" />,
    changed: <FileEdit className="h-3 w-3" />,
    deleted: <FileMinus className="h-3 w-3" />,
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border',
        colors[type],
      )}
    >
      {icons[type]}
      {count}
    </span>
  )
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return new Date(dateStr).toLocaleDateString()
}

export function CheckpointViewer({
  checkpoints,
  onAccept,
  onReject,
  onRollback,
  onViewDiff,
  className,
  compact = false,
}: CheckpointViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (checkpoints.length === 0) {
    return null
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className={cn('space-y-1', className)}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50 mb-1">
          <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Checkpoints ({checkpoints.length})</span>
        </div>
      )}

      {/* Checkpoint list */}
      <div className="space-y-1">
        {checkpoints.map((cp, index) => (
          <div
            key={cp.id}
            className={cn(
              'group rounded-md border transition-all duration-200',
              cp.status === 'active' && 'border-blue-500/30 bg-blue-500/5',
              cp.status === 'accepted' && 'border-emerald-500/20 bg-emerald-500/5',
              cp.status === 'rejected' && 'border-red-500/20 bg-red-500/5',
              cp.status === 'rolled_back' && 'border-amber-500/20 bg-amber-500/5',
            )}
          >
            {/* Checkpoint header */}
            <button
              onClick={() => toggleExpand(cp.id)}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left"
            >
              <StatusIcon status={cp.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs font-medium truncate',
                      cp.status === 'active' && 'text-blue-600 dark:text-blue-400',
                    )}
                  >
                    {cp.label}
                  </span>
                  {compact && (
                    <div className="flex items-center gap-1">
                      <ChangeBadge type="added" count={cp.addedFiles.length} />
                      <ChangeBadge type="changed" count={cp.changedFiles.length} />
                      <ChangeBadge type="deleted" count={cp.deletedFiles.length} />
                    </div>
                  )}
                </div>
                {!compact && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{formatTimeAgo(cp.timestamp)}</span>
                    {cp.metadata?.stage && (
                      <span className="text-[10px] text-muted-foreground/50">· {cp.metadata.stage}</span>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <ChangeBadge type="added" count={cp.addedFiles.length} />
                      <ChangeBadge type="changed" count={cp.changedFiles.length} />
                      <ChangeBadge type="deleted" count={cp.deletedFiles.length} />
                    </div>
                  </div>
                )}
              </div>
              {expandedId === cp.id ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {/* Expanded details */}
            {expandedId === cp.id && (
              <div className="px-2.5 pb-2 space-y-2">
                {/* Description */}
                {cp.description && <p className="text-[11px] text-muted-foreground">{cp.description}</p>}

                {/* File changes */}
                {(cp.changedFiles.length > 0 || cp.addedFiles.length > 0 || cp.deletedFiles.length > 0) && (
                  <div className="space-y-0.5">
                    {cp.changedFiles.map((file) => (
                      <div key={file} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <FileEdit className="h-3 w-3 text-amber-500" />
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {cp.addedFiles.map((file) => (
                      <div key={file} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <FilePlus className="h-3 w-3 text-emerald-500" />
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {cp.deletedFiles.map((file) => (
                      <div key={file} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <FileMinus className="h-3 w-3 text-red-500" />
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                {cp.status === 'active' && (
                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAccept?.(cp.id)
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3 me-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        onReject?.(cp.id)
                      }}
                    >
                      <XCircle className="h-3 w-3 me-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewDiff?.(cp.id)
                      }}
                    >
                      <Eye className="h-3 w-3 me-1" />
                      View Diff
                    </Button>
                  </div>
                )}

                {/* Rollback button for non-active checkpoints */}
                {cp.status !== 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRollback?.(cp.id)
                    }}
                  >
                    <RotateCcw className="h-3 w-3 me-1" />
                    Rollback to here
                  </Button>
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
 * Small inline indicator showing checkpoint status for task lists.
 */
export function CheckpointBadge({
  checkpoints,
  className,
}: {
  checkpoints: CheckpointViewerData[]
  className?: string
}) {
  const activeCount = checkpoints.filter((c) => c.status === 'active').length
  const acceptedCount = checkpoints.filter((c) => c.status === 'accepted').length

  if (activeCount > 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[10px] text-blue-500', className)}>
        <Clock className="h-2.5 w-2.5" />
        {activeCount} pending
      </span>
    )
  }

  if (acceptedCount > 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[10px] text-emerald-500', className)}>
        <CheckCircle2 className="h-2.5 w-2.5" />
        {acceptedCount} accepted
      </span>
    )
  }

  return null
}
