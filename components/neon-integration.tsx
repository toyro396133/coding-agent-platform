'use client'

import { AlertCircle, CheckCircle2, Database, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function NeonIntegration() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'connected' | 'error'>('idle')
  const [version, setVersion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/neon/health')
      const data = await res.json()
      if (!res.ok || data.status !== 'connected') {
        setStatus('error')
        setError(data.message || data.error || 'Connection failed')
        setVersion(null)
      } else {
        setStatus('connected')
        setVersion(data.version || null)
      }
    } catch (_err) {
      setStatus('error')
      setError('Failed to reach Neon health endpoint')
      setVersion(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Neon Database</CardTitle>
            <CardDescription>Serverless Postgres connection status and health checks.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={checkHealth} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 me-2', loading && 'animate-spin')} />
            Check connection
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium">Connection status</div>
            <div className="text-muted-foreground">
              {status === 'idle' && 'Not checked yet'}
              {status === 'connected' && 'Connected'}
              {status === 'error' && 'Error'}
            </div>
          </div>
          {status === 'connected' && <Badge variant="default">Healthy</Badge>}
          {status === 'error' && <Badge variant="destructive">Unhealthy</Badge>}
        </div>

        {status === 'connected' && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Connected to Neon Postgres
            </div>
            {version && <div className="mt-1 text-xs">{version}</div>}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>{error}</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
