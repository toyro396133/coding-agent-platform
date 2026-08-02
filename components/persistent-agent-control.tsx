'use client'

import { Activity, Loader2, Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PersistentAgentControlProps {
  taskId: string
  agent: string
  className?: string
}

export function PersistentAgentControl({ taskId, agent, className }: PersistentAgentControlProps) {
  const [running, setRunning] = useState(false)
  const [runs, setRuns] = useState(0)
  const [loading, setLoading] = useState(false)

  const checkStatus = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/persistent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
      const data = await res.json()
      setRunning(data.running || false)
      setRuns(data.runs || 0)
    } catch (_e) {
      console.error('Persistent agent status check failed')
    }
  }

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [checkStatus])

  const startAgent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/persistent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', intervalMs: 60000, maxRuns: 10 }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRunning(true)
      }
    } catch (_e) {
      console.error('Persistent agent start failed')
    } finally {
      setLoading(false)
    }
  }

  const stopAgent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/persistent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRunning(false)
      }
    } catch (_e) {
      console.error('Persistent agent stop failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Cloud Agent 24/7
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Badge variant={running ? 'default' : 'secondary'} className="text-[10px] px-2 py-0 h-5">
            {running ? 'Running' : 'Stopped'}
          </Badge>
          {running && <span className="text-xs text-muted-foreground">Runs: {runs}</span>}
          <div className="flex-1" />
          {running ? (
            <Button variant="destructive" size="sm" className="h-7 px-3 text-xs" onClick={stopAgent} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              Stop
            </Button>
          ) : (
            <Button variant="default" size="sm" className="h-7 px-3 text-xs" onClick={startAgent} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start ({agent})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
