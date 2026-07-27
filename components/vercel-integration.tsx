'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type VercelUser = { id: string; username: string; email?: string }
type VercelProject = { id: string; name: string; framework?: string | null }
type VercelDeployment = {
  id: string
  url: string
  name: string
  state: string
  created: number
  projectId: string
}

export function VercelIntegration() {
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<VercelUser | null>(null)
  const [projects, setProjects] = useState<VercelProject[]>([])
  const [deployments, setDeployments] = useState<Record<string, VercelDeployment[]>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchUser = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/vercel/user')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setUser(null)
      } else {
        setUser(data.user)
      }
    } catch (err) {
      setError('Failed to connect to Vercel')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/vercel/projects')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setProjects([])
      } else {
        setProjects(data.projects || [])
      }
    } catch (err) {
      setError('Failed to fetch Vercel projects')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  const fetchDeployments = async (projectId: string) => {
    try {
      const res = await fetch(`/api/vercel/deployments?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      if (!data.error) {
        setDeployments((prev) => ({ ...prev, [projectId]: data.deployments || [] }))
      }
    } catch (err) {
      console.error('Failed to fetch deployments', err)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Vercel Integration</CardTitle>
            <CardDescription>
              Connect your application to the Vercel API for deployment and project management.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchUser()
              fetchProjects()
            }}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 me-2', loading && 'animate-spin')} />
            {user ? 'Refresh' : 'Connect'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {user && (
          <div className="rounded-md border p-4 space-y-2 bg-muted/20">
            <h4 className="font-medium text-sm">Authenticated Vercel User</h4>
            <div className="text-sm">
              <span className="font-medium">{user.username}</span>
              {user.email && <span className="text-muted-foreground ms-2">{user.email}</span>}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Projects</h4>
          {projects.length === 0 && !loading && !error && (
            <p className="text-sm text-muted-foreground">Click Connect to load projects from Vercel.</p>
          )}
          {projects.map((project) => (
            <ProjectItem key={project.id} project={project} deployments={deployments} onLoad={fetchDeployments} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectItem({
  project,
  deployments,
  onLoad,
}: {
  project: VercelProject
  deployments: Record<string, VercelDeployment[]>
  onLoad: (projectId: string) => void
}) {
  const projectDeployments = deployments[project.id] || []
  const hasLoaded = project.id in deployments

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{project.name}</span>
          {project.framework && (
            <Badge variant="outline" className="text-[10px]">
              {project.framework}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onLoad(project.id)} disabled={hasLoaded}>
          {hasLoaded ? 'Loaded' : 'Load deployments'}
        </Button>
      </div>
      {projectDeployments.length > 0 && (
        <div className="space-y-1 pl-2 border-l-2 border-muted">
          {projectDeployments.slice(0, 5).map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <DeploymentStatus state={d.state} />
                <span className="text-xs text-muted-foreground">{new Date(d.created).toLocaleString()}</span>
              </div>
              <a
                href={`https://${d.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-xs text-blue-600 hover:underline"
              >
                Visit <ExternalLink className="h-3 w-3 ms-1" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeploymentStatus({ state }: { state: string }) {
  const variant =
    state === 'READY' ? 'default' : state === 'ERROR' ? 'destructive' : state === 'BUILDING' ? 'secondary' : 'outline'
  return (
    <Badge variant={variant as any} className="text-[10px]">
      {state.toLowerCase()}
    </Badge>
  )
}
