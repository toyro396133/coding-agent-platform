'use client'

import { ArrowDown, ArrowUp, Check, FileDiff, GitBranch, GitCommit, List, Loader2, RefreshCw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface GitToolbarProps {
  taskId: string
  className?: string
}

interface GitResult {
  success: boolean
  output?: string
  error?: string
}

export function GitToolbar({ taskId, className }: GitToolbarProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [showCommitInput, setShowCommitInput] = useState(false)

  const runGit = useCallback(
    async (action: string, extra: Record<string, string> = {}): Promise<GitResult> => {
      setLoading(action)
      setOutput(null)
      setError(null)
      try {
        const res = await fetch(`/api/tasks/${taskId}/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...extra }),
        })
        const data = await res.json()
        if (data.output) setOutput(data.output)
        if (data.error) setError(data.error)
        return data
      } catch (_e) {
        setError('Network error')
        return { success: false, error: 'Network error' }
      } finally {
        setLoading(null)
      }
    },
    [taskId],
  )

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return
    const result = await runGit('commit', { message: commitMessage.trim() })
    if (result.success) {
      setCommitMessage('')
      setShowCommitInput(false)
    }
  }, [commitMessage, runGit])

  const btnClass = 'h-8 px-2 text-xs gap-1'

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('status')}
          disabled={loading !== null}
        >
          {loading === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <List className="h-3.5 w-3.5" />}
          Status
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('log', { count: '10' })}
          disabled={loading !== null}
        >
          {loading === 'log' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
          Log
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('diff')}
          disabled={loading !== null}
        >
          {loading === 'diff' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDiff className="h-3.5 w-3.5" />}
          Diff
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('branch')}
          disabled={loading !== null}
        >
          {loading === 'branch' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitBranch className="h-3.5 w-3.5" />
          )}
          Branch
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('fetch')}
          disabled={loading !== null}
        >
          {loading === 'fetch' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Fetch
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('pull')}
          disabled={loading !== null}
        >
          {loading === 'pull' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )}
          Pull
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => runGit('push')}
          disabled={loading !== null}
        >
          {loading === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
          Push
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => setShowCommitInput(!showCommitInput)}
          disabled={loading !== null}
        >
          <GitCommit className="h-3.5 w-3.5" />
          Commit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={btnClass}
          onClick={() => {
            setOutput(null)
            setError(null)
          }}
          disabled={!output && !error}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {showCommitInput && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Commit message..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="h-8 text-xs flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
          />
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={handleCommit}
            disabled={!commitMessage.trim() || loading === 'commit'}
          >
            {loading === 'commit' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Commit
          </Button>
        </div>
      )}

      {output && (
        <pre className="text-xs bg-muted p-2 rounded-md max-h-40 overflow-auto text-muted-foreground">{output}</pre>
      )}
      {error && (
        <pre className="text-xs bg-destructive/10 p-2 rounded-md max-h-40 overflow-auto text-destructive">{error}</pre>
      )}
    </div>
  )
}
