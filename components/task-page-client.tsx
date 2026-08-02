'use client'

import { useState, useMemo } from 'react'
import { useTask } from '@/lib/hooks/use-task'
import { TaskDetails } from '@/components/task-details'
import { SharedHeader } from '@/components/shared-header'
import { TaskActions } from '@/components/task-actions'
import { LogsPane } from '@/components/logs-pane'
import { GitToolbar } from '@/components/git-toolbar'
import { PluginManager } from '@/components/plugin-manager'
import { PersistentAgentControl } from '@/components/persistent-agent-control'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/error-state'
import { cn } from '@/lib/utils'
import { GitBranch, Puzzle, X, Loader2, CheckCircle2, AlertCircle, Clock, Square } from 'lucide-react'
import type { Session } from '@/lib/session/types'
import { useLocale } from '@/components/providers/locale-provider'
import type { Task } from '@/lib/db/schema'

// Color + icon per task status — makes the lifecycle identifiable at a glance.
const TASK_STATUS_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; className: string; spin?: boolean }
> = {
  pending: { icon: Clock, className: 'text-muted-foreground bg-muted/60' },
  processing: { icon: Loader2, className: 'text-blue-600 dark:text-blue-400 bg-blue-500/10', spin: true },
  completed: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  error: { icon: AlertCircle, className: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  stopped: { icon: Square, className: 'text-orange-600 dark:text-orange-400 bg-orange-500/10' },
  PLANNING_PENDING_APPROVAL: { icon: Clock, className: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
}

function TaskStatusBanner({ task }: { task: Task }) {
  const { t } = useLocale()
  const meta = TASK_STATUS_META[task.status] || TASK_STATUS_META.pending
  const Icon = meta.icon
  // PLANNING_PENDING_APPROVAL maps to the `planning` dictionary key; every
  // other status matches a key directly.
  const statusKey =
    task.status === 'PLANNING_PENDING_APPROVAL' ? 'planning' : (task.status as keyof typeof t.tasks.status)
  const label = t.tasks.status[statusKey] || t.tasks.status.pending

  return (
    <div
      className={cn('flex flex-shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs font-medium', meta.className)}
      role="status"
    >
      <Icon className={cn('h-3.5 w-3.5', meta.spin && 'animate-spin')} />
      <span className="truncate">{label}</span>
      {task.status === 'processing' && task.progress != null && task.progress > 0 && (
        <span className="opacity-70">· {task.progress}%</span>
      )}
    </div>
  )
}

interface TaskPageClientProps {
  taskId: string
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
  maxSandboxDuration?: number
}

function parseRepoFromUrl(repoUrl: string | null): { owner: string; repo: string } | null {
  if (!repoUrl) return null
  try {
    const url = new URL(repoUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)
    if (pathParts.length >= 2) {
      return {
        owner: pathParts[0],
        repo: pathParts[1].replace(/\.git$/, ''),
      }
    }
    return null
  } catch {
    return null
  }
}

export function TaskPageClient({
  taskId,
  user,
  authProvider,
  initialStars = 1200,
  maxSandboxDuration = 300,
}: TaskPageClientProps) {
  const { t } = useLocale()
  const { task, isLoading, error, refetch } = useTask(taskId)
  const [logsPaneHeight, setLogsPaneHeight] = useState(40)
  const [showGitPanel, setShowGitPanel] = useState(false)
  const [showPlugins, setShowPlugins] = useState(false)
  const [showPersistent, setShowPersistent] = useState(false)

  const repoInfo = useMemo(() => parseRepoFromUrl(task?.repoUrl ?? null), [task?.repoUrl])

  const headerLeftActions = repoInfo ? (
    <div className="flex items-center gap-2 min-w-0">
      <h1 className="text-lg font-semibold truncate">
        {repoInfo.owner}/{repoInfo.repo}
      </h1>
    </div>
  ) : null

  if (isLoading) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <SharedHeader initialStars={initialStars} />
        </div>
        <div className="mx-auto max-w-2xl p-3">
          {/* Loading skeleton */}
          <div className="space-y-3" aria-label="Loading task">
            <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/70 animate-pulse" />
            <div className="h-40 w-full rounded-lg bg-muted/50 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <SharedHeader initialStars={initialStars} />
        </div>
        <div className="mx-auto max-w-2xl p-3">
          <ErrorState
            title={t.taskDetails.notFound}
            description={error || t.taskDetails.notFoundDesc}
            retryLabel={t.common.retry}
            onRetry={() => refetch()}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-3 py-2 border-b">
        <SharedHeader
          leftActions={headerLeftActions}
          initialStars={initialStars}
          extraActions={<TaskActions task={task} />}
        />
      </div>

      {/* Task lifecycle status banner */}
      <TaskStatusBanner task={task} />

      {/* Subtle completion celebration — only when finished with no errors.
          No role="status" here: the TaskStatusBanner above already announces completion. */}
      {task.status === 'completed' && !task.error && (
        <div
          className="flex flex-shrink-0 items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs"
          style={{ animation: 'fadeIn 0.5s ease-out' }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium text-emerald-700 dark:text-emerald-300">{t.taskDetails.completedTitle}</span>
          <span className="truncate text-muted-foreground">{t.taskDetails.completedDesc}</span>
        </div>
      )}

      {/* Git Toolbar & Extensions */}
      <div className="flex-shrink-0 border-b bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 px-2 text-xs gap-1', showGitPanel && 'bg-accent')}
            onClick={() => {
              setShowGitPanel(!showGitPanel)
              setShowPlugins(false)
              setShowPersistent(false)
            }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Git
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 px-2 text-xs gap-1', showPlugins && 'bg-accent')}
            onClick={() => {
              setShowPlugins(!showPlugins)
              setShowGitPanel(false)
              setShowPersistent(false)
            }}
          >
            <Puzzle className="h-3.5 w-3.5" />
            Extensions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 px-2 text-xs gap-1', showPersistent && 'bg-accent')}
            onClick={() => {
              setShowPersistent(!showPersistent)
              setShowGitPanel(false)
              setShowPlugins(false)
            }}
          >
            <X className="h-3.5 w-3.5" />
            Cloud Agent
          </Button>
        </div>
        {showGitPanel && (
          <div className="mt-2 pb-2">
            <GitToolbar taskId={task.id} />
          </div>
        )}
        {showPlugins && (
          <div className="mt-2 pb-2">
            <PluginManager />
          </div>
        )}
        {showPersistent && (
          <div className="mt-2 pb-2">
            <PersistentAgentControl taskId={task.id} agent={task.selectedAgent || 'claude'} />
          </div>
        )}
      </div>

      {/* Task details */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ paddingBottom: `${logsPaneHeight}px` }}>
        <TaskDetails task={task} maxSandboxDuration={maxSandboxDuration} />
      </div>

      {/* Logs pane at bottom */}
      <LogsPane task={task} onHeightChange={setLogsPaneHeight} />
    </div>
  )
}
