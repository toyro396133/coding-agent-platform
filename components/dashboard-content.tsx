'use client'

import {
  Activity,
  ArrowRight,
  Bot,
  Bug,
  CheckCircle2,
  Clock,
  Cpu,
  GitBranch,
  Layers,
  Plus,
  Sparkles,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTasks } from '@/components/app-layout'
import { useLocale } from '@/components/providers/locale-provider'
import { SharedHeader } from '@/components/shared-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Session } from '@/lib/session/types'
import { cn } from '@/lib/utils'

interface DashboardContentProps {
  user: Session['user']
  authProvider?: string
  initialStars?: number
}

interface DashboardStats {
  totalTasks: number
  activeTasks: number
  completedTasks: number
  failedTasks: number
  daemonAgents: { id: string; label: string; status: string; iterations: number }[]
  recentTasks: {
    id: string
    title: string
    status: string
    repoUrl: string
    createdAt: string
  }[]
}

export function DashboardContent({ user, authProvider, initialStars = 0 }: DashboardContentProps) {
  const { t } = useLocale()
  const { refreshTasks, toggleSidebar } = useTasks()
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    daemonAgents: [],
    recentTasks: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/tasks')
        if (response.ok) {
          const data = await response.json()
          const tasks = data.tasks || []
          setStats({
            totalTasks: tasks.length,
            activeTasks: tasks.filter((t: any) => t.status === 'processing' || t.status === 'pending').length,
            completedTasks: tasks.filter((t: any) => t.status === 'completed').length,
            failedTasks: tasks.filter((t: any) => t.status === 'error').length,
            daemonAgents: [],
            recentTasks: tasks.slice(0, 5).map((task: any) => ({
              id: task.id,
              title: task.title || task.prompt?.slice(0, 60) || t.dashboard.untitled,
              status: task.status,
              repoUrl: task.repoUrl || '',
              createdAt: task.createdAt || '',
            })),
          })
        }
      } catch {
        // Best-effort stats loading
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards = [
    {
      id: 'active',
      label: t.dashboard.activeTasks,
      value: stats.activeTasks,
      icon: Activity,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      href: '/tasks',
    },
    {
      id: 'completed',
      label: t.dashboard.completed,
      value: stats.completedTasks,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      href: '/tasks',
    },
    {
      id: 'failed',
      label: t.dashboard.failed,
      value: stats.failedTasks,
      icon: Bug,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      href: '/tasks',
    },
    {
      id: 'daemons',
      label: t.dashboard.daemonAgents,
      value: stats.daemonAgents.length,
      icon: Cpu,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      href: '/agents',
    },
  ]

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-500'
      case 'processing':
        return 'text-amber-500'
      case 'pending':
        return 'text-blue-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-muted-foreground'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t.dashboard.done
      case 'processing':
        return t.dashboard.running
      case 'pending':
        return t.dashboard.queued
      case 'error':
        return t.dashboard.failed
      default:
        return status
    }
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <SharedHeader
          leftActions={
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground hidden sm:block">{t.dashboard.title}</h1>
            </div>
          }
          initialStars={initialStars}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 md:pb-8">
        <div className="mx-auto max-w-6xl space-y-6 py-6">
          {/* Welcome */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {t.dashboard.welcome}
                {user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{t.dashboard.welcomeDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button size="sm" className="h-9 bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold">
                  <Plus className="h-4 w-4 me-1.5" />
                  {t.sidebar.newTask}
                </Button>
              </Link>
              <Link href="/agents">
                <Button variant="outline" size="sm" className="h-9">
                  <Cpu className="h-4 w-4 me-1.5" />
                  {t.sidebar.agents}
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {statCards.map((stat) => (
              <Link key={stat.id} href={stat.href}>
                <Card className="cursor-pointer hover:border-amber-500/20 transition-all hover:shadow-md">
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          {stat.label}
                        </p>
                        <p className={cn('text-3xl font-bold mt-1', stat.color)}>{loading ? '—' : stat.value}</p>
                      </div>
                      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', stat.bgColor)}>
                        <stat.icon className={cn('h-5 w-5', stat.color)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Quick Actions & Recent Tasks */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  {t.dashboard.quickActions}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  {
                    id: 'new-task',
                    icon: Plus,
                    label: t.dashboard.newCodingTask,
                    desc: t.dashboard.newCodingTaskDesc,
                    href: '/',
                  },
                  {
                    id: 'spawn-daemon',
                    icon: Cpu,
                    label: t.dashboard.spawnDaemon,
                    desc: t.dashboard.spawnDaemonDesc,
                    href: '/agents',
                  },
                  {
                    id: 'view-tasks',
                    icon: Layers,
                    label: t.dashboard.viewAllTasks,
                    desc: t.dashboard.viewAllTasksDesc,
                    href: '/tasks',
                  },
                  {
                    id: 'browse-repos',
                    icon: GitBranch,
                    label: t.dashboard.browseRepos,
                    desc: t.dashboard.browseReposDesc,
                    href: '#',
                  },
                ].map((action) => (
                  <Link
                    key={action.id}
                    href={action.href}
                    className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent transition-colors group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center group-hover:bg-amber-500/10 transition-colors">
                      <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-180" />
                  </Link>
                ))}
              </CardContent>
            </Card>

            {/* Recent Tasks */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  {t.dashboard.recentTasks}
                </CardTitle>
                <Link href="/tasks">
                  <Button variant="ghost" size="sm" className="h-8 text-xs">
                    {t.dashboard.viewAll}
                    <ArrowRight className="h-3 w-3 ms-1 rtl:rotate-180" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : stats.recentTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{t.tasks.noTasksTitle}</p>
                    <Link href="/">
                      <Button variant="link" size="sm" className="mt-1">
                        <Sparkles className="h-3 w-3 me-1 rtl:scale-x-[-1]" />
                        {t.tasks.createFirstTask}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {stats.recentTasks.map((task) => (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-accent transition-colors"
                      >
                        <div
                          className={cn(
                            'h-2 w-2 rounded-full flex-shrink-0',
                            task.status === 'completed' && 'bg-emerald-500',
                            task.status === 'processing' && 'bg-amber-500',
                            task.status === 'pending' && 'bg-blue-500',
                            task.status === 'error' && 'bg-red-500',
                            !['completed', 'processing', 'pending', 'error'].includes(task.status) &&
                              'bg-muted-foreground',
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          {task.repoUrl && (
                            <p className="text-xs text-muted-foreground truncate">
                              {(() => {
                                try {
                                  const url = new URL(task.repoUrl)
                                  return url.pathname.replace(/^\//, '').replace(/\.git$/, '')
                                } catch {
                                  return task.repoUrl
                                }
                              })()}
                            </p>
                          )}
                        </div>
                        <span className={cn('text-xs font-medium', statusColor(task.status))}>
                          {statusLabel(task.status)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
