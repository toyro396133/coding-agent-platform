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
import { cn } from '@/lib/utils'
import { GitBranch, Puzzle, X } from 'lucide-react'
import type { Session } from '@/lib/session/types'

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
  const { task, isLoading, error } = useTask(taskId)
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
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <SharedHeader initialStars={initialStars} />
        </div>
        <div className="mx-auto p-3">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-2">Task Not Found</h2>
              <p className="text-muted-foreground">{error || 'The requested task could not be found.'}</p>
            </div>
          </div>
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
