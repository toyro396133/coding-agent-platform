'use client'

import { Activity, Cpu, Plus, RefreshCw, Square, Zap } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useLocale } from '@/components/providers/locale-provider'
import { SharedHeader } from '@/components/shared-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Session } from '@/lib/session/types'
import { cn } from '@/lib/utils'

interface AgentsContentProps {
  user: Session['user']
  initialStars?: number
}

interface DaemonInfo {
  id: string
  label: string
  agentType: string
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'error'
  iterations: number
  lastResult?: string
  lastError?: string
  startedAt: number
  lastIterationAt?: number
}

export function AgentsContent({ user, initialStars = 0 }: AgentsContentProps) {
  const { t } = useLocale()
  const [daemons, setDaemons] = useState<DaemonInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDaemons()
    const interval = setInterval(fetchDaemons, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchDaemons = async () => {
    try {
      const response = await fetch('/api/agents/daemons')
      if (response.ok) {
        const data = await response.json()
        setDaemons(data.daemons || [])
      }
    } catch {
      // Best-effort
    } finally {
      setLoading(false)
    }
  }

  const handleStopDaemon = async (id: string) => {
    try {
      const response = await fetch(`/api/agents/daemons/${id}/stop`, { method: 'POST' })
      if (response.ok) {
        toast.success(t.agents.stopSuccess)
        fetchDaemons()
      } else {
        toast.error(t.agents.stopFailed)
      }
    } catch {
      toast.error(t.agents.stopFailed)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-emerald-500'
      case 'starting':
        return 'text-amber-500'
      case 'paused':
        return 'text-blue-500'
      case 'error':
        return 'text-red-500'
      case 'stopped':
        return 'text-muted-foreground'
      default:
        return 'text-muted-foreground'
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            {t.agents.running}
          </Badge>
        )
      case 'starting':
        return (
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
            {t.agents.starting}
          </Badge>
        )
      case 'paused':
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
            {t.agents.paused}
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20">
            {t.agents.error}
          </Badge>
        )
      case 'stopped':
        return <Badge variant="outline">{t.agents.stopped}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const agentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      claude: 'Claude',
      cursor: 'Cursor',
      codex: 'Codex',
      gemini: 'Gemini',
      copilot: 'Copilot',
      opencode: 'OpenCode',
    }
    return labels[type] || type
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <SharedHeader
          leftActions={
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground hidden sm:block">{t.agents.title}</h1>
            </div>
          }
          initialStars={initialStars}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 md:pb-8">
        <div className="mx-auto max-w-4xl space-y-6 py-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Cpu className="h-6 w-6 text-violet-500" />
                {t.agents.daemonAgents}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{t.agents.daemonDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9" onClick={fetchDaemons}>
                <RefreshCw className="h-4 w-4 me-1.5" />
                {t.agents.refresh}
              </Button>
              <Link href="/">
                <Button size="sm" className="h-9 bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold">
                  <Plus className="h-4 w-4 me-1.5" />
                  {t.sidebar.newTask}
                </Button>
              </Link>
            </div>
          </div>

          {/* Daemon Agent Cards */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="h-20 bg-muted rounded-lg animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : daemons.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Cpu className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-1">{t.agents.noDaemonsTitle}</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{t.agents.noDaemonsDesc}</p>
                <Link href="/">
                  <Button variant="outline" size="sm">
                    <Zap className="h-4 w-4 me-1.5" />
                    {t.agents.spawnFromTask}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {daemons.map((daemon) => (
                <Card
                  key={daemon.id}
                  className={cn(
                    'transition-all',
                    daemon.status === 'running' && 'border-emerald-500/20',
                    daemon.status === 'error' && 'border-red-500/20',
                  )}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold">{daemon.label}</h3>
                          {statusBadge(daemon.status)}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            {agentTypeLabel(daemon.agentType)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            {t.agents.iterations.replace('{count}', String(daemon.iterations))}
                          </span>
                          <span>
                            {t.agents.started.replace('{time}', new Date(daemon.startedAt).toLocaleTimeString())}
                          </span>
                          {daemon.lastIterationAt && (
                            <span>
                              {t.agents.lastIteration.replace(
                                '{time}',
                                new Date(daemon.lastIterationAt).toLocaleTimeString(),
                              )}
                            </span>
                          )}
                        </div>
                        {daemon.lastResult && (
                          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                            <p className="text-xs font-medium text-muted-foreground mb-1">{t.agents.lastResult}</p>
                            <p className="text-sm text-foreground/80 line-clamp-3 font-mono text-xs">
                              {daemon.lastResult}
                            </p>
                          </div>
                        )}
                        {daemon.lastError && (
                          <div className="mt-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                            <p className="text-xs font-medium text-red-500 mb-1">{t.agents.lastError}</p>
                            <p className="text-sm text-red-400 line-clamp-2 font-mono text-xs">{daemon.lastError}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {daemon.status === 'running' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => handleStopDaemon(daemon.id)}
                            title={t.agents.stopDaemon}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
