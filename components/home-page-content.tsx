'use client'

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ExternalLink, MoreHorizontal, Plus, RefreshCw, Settings, Sparkles, Unlink, Zap } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTasks } from '@/components/app-layout'
import { HomePageMobileFooter } from '@/components/home-page-mobile-footer'
import { GitHubIcon } from '@/components/icons/github-icon'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { MultiRepoDialog } from '@/components/multi-repo-dialog'
import { OpenRepoUrlDialog } from '@/components/open-repo-url-dialog'
import { useLocale } from '@/components/providers/locale-provider'
import { QueuePanel } from '@/components/queue-panel'
import { RepoSelector } from '@/components/repo-selector'
import { SharedHeader } from '@/components/shared-header'
import { TaskForm } from '@/components/task-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { githubConnectionAtom, githubConnectionInitializedAtom } from '@/lib/atoms/github-connection'
import { multiRepoModeAtom, selectedReposAtom } from '@/lib/atoms/multi-repo'
import { sessionAtom } from '@/lib/atoms/session'
import { taskPromptAtom } from '@/lib/atoms/task'
import { getEnabledAuthProviders } from '@/lib/auth/providers'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { redirectToSignIn } from '@/lib/session/redirect-to-sign-in'
import type { Session } from '@/lib/session/types'
import { cn } from '@/lib/utils'
import { setSelectedOwner, setSelectedRepo } from '@/lib/utils/cookies'

const HERO_PROMPTS = [
  'בנה API לרשימת משימות עם Express ו-TypeScript',
  'צור דף נחיתה רספונסיבי עם Tailwind',
  'הוסף מערכת אימות עם NextAuth ו-Postgres',
] as const

const HERO_AGENTS = [
  { name: 'Claude', Logo: Claude, delay: 0 },
  { name: 'Codex', Logo: Codex, delay: 100 },
  { name: 'Cursor', Logo: Cursor, delay: 200 },
  { name: 'Copilot', Logo: Copilot, delay: 300 },
  { name: 'Gemini', Logo: Gemini, delay: 400 },
  { name: 'OpenCode', Logo: OpenCode, delay: 500 },
] as const

interface HomePageContentProps {
  initialSelectedOwner?: string
  initialSelectedRepo?: string
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
  initialKeepAlive?: boolean
  initialEnableBrowser?: boolean
  maxSandboxDuration?: number
  user?: Session['user'] | null
  initialStars?: number
}

export function HomePageContent({
  initialSelectedOwner = '',
  initialSelectedRepo = '',
  initialInstallDependencies = false,
  initialMaxDuration = 300,
  initialKeepAlive = false,
  initialEnableBrowser = false,
  maxSandboxDuration = 300,
  user = null,
  initialStars = 1200,
}: HomePageContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedOwner, setSelectedOwnerState] = useState(initialSelectedOwner)
  const [selectedRepo, setSelectedRepoState] = useState(initialSelectedRepo)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [loadingVercel, setLoadingVercel] = useState(false)
  const [loadingGitHub, setLoadingGitHub] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showOpenRepoDialog, setShowOpenRepoDialog] = useState(false)
  const [showMultiRepoDialog, setShowMultiRepoDialog] = useState(false)
  const { t } = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshTasks, addTaskOptimistically } = useTasks()
  const setTaskPrompt = useSetAtom(taskPromptAtom)

  // Multi-repo mode state
  const multiRepoMode = useAtomValue(multiRepoModeAtom)
  const [selectedRepos, setSelectedRepos] = useAtom(selectedReposAtom)

  // GitHub connection state
  const session = useAtomValue(sessionAtom)
  const githubConnection = useAtomValue(githubConnectionAtom)
  const githubConnectionInitialized = useAtomValue(githubConnectionInitializedAtom)
  const setGitHubConnection = useSetAtom(githubConnectionAtom)
  const isGitHubAuthUser = session.authProvider === 'github'

  // Check which auth providers are enabled
  const { github: hasGitHub, vercel: hasVercel } = getEnabledAuthProviders()

  // Show toast if GitHub was connected (user was already logged in)
  useEffect(() => {
    if (searchParams.get('github_connected') === 'true') {
      toast.success('GitHub account connected successfully!')
      // Remove the query parameter from URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('github_connected')
      window.history.replaceState({}, '', newUrl.toString())
    }
  }, [searchParams])

  // Check for newly created repo and select it
  useEffect(() => {
    const newlyCreatedRepo = localStorage.getItem('newly-created-repo')
    if (newlyCreatedRepo) {
      try {
        const { owner, repo } = JSON.parse(newlyCreatedRepo)
        if (owner && repo) {
          // Set owner and repo directly without triggering the clear logic
          setSelectedOwnerState(owner)
          setSelectedOwner(owner)
          setSelectedRepoState(repo)
          setSelectedRepo(repo)
        }
      } catch (error) {
        console.error('Error parsing newly created repo:', error)
      } finally {
        // Clear the localStorage item after using it
        localStorage.removeItem('newly-created-repo')
      }
    }
  }, []) // Run only on mount

  // Check for URL query parameters for owner and repo
  useEffect(() => {
    const urlOwner = searchParams.get('owner')
    const urlRepo = searchParams.get('repo')

    if (urlOwner && urlOwner !== selectedOwner) {
      setSelectedOwnerState(urlOwner)
      setSelectedOwner(urlOwner)
    }
    if (urlRepo && urlRepo !== selectedRepo) {
      setSelectedRepoState(urlRepo)
      setSelectedRepo(urlRepo)
    }
  }, [searchParams, selectedOwner, selectedRepo])

  // Wrapper functions to update both state and cookies
  const handleOwnerChange = (owner: string) => {
    setSelectedOwnerState(owner)
    setSelectedOwner(owner)
    // Clear repo when owner changes
    if (selectedRepo) {
      setSelectedRepoState('')
      setSelectedRepo('')
    }
  }

  const handleRepoChange = (repo: string) => {
    setSelectedRepoState(repo)
    setSelectedRepo(repo)
  }

  const handleRefreshOwners = () => {
    setIsRefreshing(true)
    localStorage.removeItem('github-owners')
    toast.success('Refreshing owners...')
    window.location.reload()
  }

  const handleRefreshRepos = () => {
    setIsRefreshing(true)
    if (selectedOwner) {
      localStorage.removeItem(`github-repos-${selectedOwner}`)
      toast.success('Refreshing repositories...')
    } else {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('github-repos-')) {
          localStorage.removeItem(key)
        }
      })
      toast.success('Refreshing all repositories...')
    }
    window.location.reload()
  }

  const handleDisconnectGitHub = async () => {
    try {
      const response = await fetch('/api/auth/github/disconnect', {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('GitHub disconnected')
        localStorage.removeItem('github-owners')
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('github-repos-')) {
            localStorage.removeItem(key)
          }
        })
        handleOwnerChange('')
        handleRepoChange('')
        setGitHubConnection({ connected: false })
        router.refresh()
      } else {
        const error = await response.json()
        console.error('Failed to disconnect GitHub:', error)
        toast.error(error.error || 'Failed to disconnect GitHub')
      }
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error)
      toast.error('Failed to disconnect GitHub')
    }
  }

  const handleNewRepo = () => {
    const url = selectedOwner ? `/repos/new?owner=${selectedOwner}` : '/repos/new'
    router.push(url)
  }

  const handleConnectGitHub = () => {
    window.location.href = '/api/auth/github/signin'
  }

  const handleReconfigureGitHub = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    if (clientId) {
      window.open(`https://github.com/settings/connections/applications/${clientId}`, '_blank')
    } else {
      window.location.href = '/api/auth/github/signin'
    }
  }

  const handleOpenRepoUrl = async (repoUrl: string) => {
    try {
      if (!user) {
        toast.error(t.home.signInRequired, {
          description: t.home.signInRequiredDesc,
        })
        return
      }

      const taskData = {
        prompt: t.home.workOnThisRepo,
        repoUrl: repoUrl,
        selectedAgent: localStorage.getItem('last-selected-agent') || 'claude',
        selectedModel: localStorage.getItem('last-selected-model-claude') || 'claude-sonnet-4-5',
        installDependencies: true,
        maxDuration: 300,
        keepAlive: false,
      }

      const { id } = addTaskOptimistically(taskData)
      router.push(`/tasks/${id}`)

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...taskData, id }),
      })

      if (response.ok) {
        toast.success(t.home.taskCreated)
      } else {
        const error = await response.json()
        toast.error(error.message || error.error || t.home.failedToCreateTask)
      }
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error(t.home.failedToCreateTask)
    }
  }

  // ─── Terminal hero state ───
  const [heroPromptIndex, setHeroPromptIndex] = useState(0)
  const [heroTyped, setHeroTyped] = useState('')
  const [heroCursor, setHeroCursor] = useState(true)
  const [agentsRevealed, setAgentsRevealed] = useState(false)
  const heroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Typing animation for the hero prompt
  useEffect(() => {
    const text = HERO_PROMPTS[heroPromptIndex]
    let i = 0

    const tick = () => {
      if (i < text.length) {
        setHeroTyped(text.slice(0, i + 1))
        i++
        heroTimerRef.current = setTimeout(tick, 45 + Math.random() * 25)
      } else {
        // After typing completes, show agents, then cycle prompt
        setAgentsRevealed(true)
        heroTimerRef.current = setTimeout(() => {
          setAgentsRevealed(false)
          setHeroPromptIndex((prev) => (prev + 1) % HERO_PROMPTS.length)
        }, 4000)
      }
    }
    // Reset the typed text asynchronously, then start typing, so no state is
    // set synchronously within the effect body.
    heroTimerRef.current = setTimeout(() => {
      setHeroTyped('')
      tick()
    }, 400)
    return () => {
      if (heroTimerRef.current) clearTimeout(heroTimerRef.current)
    }
  }, [heroPromptIndex])

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => setHeroCursor((c) => !c), 530)
    return () => clearInterval(interval)
  }, [])
  const headerLeftActions = (
    <div className="flex items-center gap-1 sm:gap-2 h-8 min-w-0 flex-1">
      {!githubConnectionInitialized ? null : githubConnection.connected || isGitHubAuthUser ? (
        <>
          <RepoSelector
            selectedOwner={selectedOwner}
            selectedRepo={selectedRepo}
            onOwnerChange={handleOwnerChange}
            onRepoChange={handleRepoChange}
            size="sm"
            onMultiRepoClick={() => setShowMultiRepoDialog(true)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0" title={t.home.moreOptions}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleNewRepo}>
                <Plus className="h-4 w-4 me-2" />
                New Repo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowOpenRepoDialog(true)}>
                <ExternalLink className="h-4 w-4 me-2" />
                Open Repo URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleRefreshOwners} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 me-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Owners
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRefreshRepos} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 me-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Repos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReconfigureGitHub}>
                <Settings className="h-4 w-4 me-2" />
                Manage Access
              </DropdownMenuItem>
              {!isGitHubAuthUser && (
                <DropdownMenuItem onClick={handleDisconnectGitHub}>
                  <Unlink className="h-4 w-4 me-2" />
                  Disconnect GitHub
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : user ? (
        <Button onClick={handleConnectGitHub} variant="outline" size="sm" className="h-8 flex-shrink-0">
          <GitHubIcon className="h-4 w-4 me-2" />
          Connect GitHub
        </Button>
      ) : selectedOwner || selectedRepo ? (
        <RepoSelector
          selectedOwner={selectedOwner}
          selectedRepo={selectedRepo}
          onOwnerChange={handleOwnerChange}
          onRepoChange={handleRepoChange}
          size="sm"
        />
      ) : null}
    </div>
  )

  const handleTaskSubmit = async (data: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    selectedModels?: string[]
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
    enableBrowser: boolean
    executionLevel?: string
    sendToQueue?: boolean
    workerTeam?: {
      workers: { id: string; role: string; agentType: string; model: string; instructions: string; priority: number }[]
      timeoutMinutes: number
    }
  }) => {
    // Check if user is authenticated
    if (!user) {
      setShowSignInDialog(true)
      return
    }

    // Check if multi-repo mode is enabled
    if (multiRepoMode) {
      if (selectedRepos.length === 0) {
        toast.error('Please select repositories', {
          description: 'Click on "0 repos selected" to choose repositories.',
        })
        return
      }
    } else {
      // Check if user has selected a repository
      if (!data.repoUrl) {
        toast.error('Please select a repository', {
          description: 'Choose a GitHub repository to work with from the header.',
        })
        return
      }
    }

    // If the user chose "Add to queue", enqueue the request instead of running
    // it immediately. The queue auto-advances once current work finishes.
    if (data.sendToQueue) {
      setTaskPrompt('')
      setIsSubmitting(true)
      try {
        // Multi-repo mode: enqueue one request per selected repository (they
        // run serially in queue order). Otherwise enqueue a single request.
        const targets =
          multiRepoMode && selectedRepos.length > 0
            ? selectedRepos.map((repo) => ({ prompt: data.prompt, repoUrl: repo.clone_url }))
            : [{ prompt: data.prompt, repoUrl: data.repoUrl || null }]

        const responses = await Promise.all(
          targets.map((target) =>
            fetch('/api/queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: target.prompt,
                title: data.prompt.slice(0, 80),
                repoUrl: target.repoUrl,
                selectedAgent: data.selectedAgent,
                selectedModel: data.selectedModel,
                installDependencies: data.installDependencies,
                maxDuration: data.maxDuration,
                keepAlive: data.keepAlive,
                enableBrowser: data.enableBrowser,
              }),
            }),
          ),
        )

        const okCount = responses.filter((r) => r.ok).length
        if (okCount === responses.length) {
          toast.success(t.queue.added)
          if (multiRepoMode) setSelectedRepos([])
          window.dispatchEvent(new Event('queue-changed'))
        } else {
          const error = await responses
            .find((r) => !r.ok)
            ?.json()
            .catch(() => null)
          toast.error(error?.error || t.errors.failedToCreateTask)
        }
      } catch (error) {
        console.error('Error adding to queue:', error)
        toast.error(t.errors.failedToCreateTask)
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // Clear the saved prompt since we're actually submitting it now
    setTaskPrompt('')

    setIsSubmitting(true)

    // Check if this is multi-repo mode
    if (multiRepoMode && selectedRepos.length > 0) {
      // Create multiple tasks, one for each selected repo
      const taskIds: string[] = []
      const tasksData = selectedRepos.map((repo) => {
        const { id } = addTaskOptimistically({
          prompt: data.prompt,
          repoUrl: repo.clone_url,
          selectedAgent: data.selectedAgent,
          selectedModel: data.selectedModel,
          installDependencies: data.installDependencies,
          maxDuration: data.maxDuration,
        })
        taskIds.push(id)
        return {
          id,
          prompt: data.prompt,
          repoUrl: repo.clone_url,
          selectedAgent: data.selectedAgent,
          selectedModel: data.selectedModel,
          installDependencies: data.installDependencies,
          maxDuration: data.maxDuration,
          keepAlive: data.keepAlive,
          enableBrowser: data.enableBrowser,
          executionLevel: data.executionLevel,
        }
      })

      // Navigate to the first task
      router.push(`/tasks/${taskIds[0]}`)

      try {
        // Create all tasks in parallel
        const responses = await Promise.all(
          tasksData.map((taskData) =>
            fetch('/api/tasks', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(taskData),
            }),
          ),
        )

        const successCount = responses.filter((r) => r.ok).length
        const failCount = responses.length - successCount

        if (successCount === responses.length) {
          toast.success(`${successCount} tasks created successfully!`)
        } else if (successCount > 0) {
          toast.warning(`${successCount} tasks created, ${failCount} failed`)
        } else {
          toast.error('Failed to create tasks')
        }

        // Clear selected repos after creating tasks
        setSelectedRepos([])

        // Refresh sidebar to get the real task data from server
        await refreshTasks()
      } catch (error) {
        console.error('Error creating tasks:', error)
        toast.error('Failed to create tasks')
        await refreshTasks()
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // Check if this is multi-agent mode with multiple models selected
    const isMultiAgent = data.selectedAgent === 'multi-agent' && data.selectedModels && data.selectedModels.length > 0

    if (isMultiAgent) {
      // Create multiple tasks, one for each selected model
      const taskIds: string[] = []
      const tasksData = data.selectedModels?.map((modelValue) => {
        // Parse agent:model format
        const [agent, model] = modelValue.split(':')
        const { id } = addTaskOptimistically({
          prompt: data.prompt,
          repoUrl: data.repoUrl,
          selectedAgent: agent,
          selectedModel: model,
          installDependencies: data.installDependencies,
          maxDuration: data.maxDuration,
        })
        taskIds.push(id)
        return {
          id,
          prompt: data.prompt,
          repoUrl: data.repoUrl,
          selectedAgent: agent,
          selectedModel: model,
          installDependencies: data.installDependencies,
          maxDuration: data.maxDuration,
          keepAlive: data.keepAlive,
          enableBrowser: data.enableBrowser,
          executionLevel: data.executionLevel,
        }
      })

      // Navigate to the first task
      router.push(`/tasks/${taskIds[0]}`)

      try {
        // Create all tasks in parallel
        const responses = await Promise.all(
          tasksData.map((taskData) =>
            fetch('/api/tasks', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(taskData),
            }),
          ),
        )

        const successCount = responses.filter((r) => r.ok).length
        const failCount = responses.length - successCount

        if (successCount === responses.length) {
          toast.success(`${successCount} tasks created successfully!`)
        } else if (successCount > 0) {
          toast.warning(`${successCount} tasks created, ${failCount} failed`)
        } else {
          toast.error('Failed to create tasks')
        }

        // Refresh sidebar to get the real task data from server
        await refreshTasks()
      } catch (error) {
        console.error('Error creating tasks:', error)
        toast.error('Failed to create tasks')
        await refreshTasks()
      } finally {
        setIsSubmitting(false)
      }
    } else {
      // Single task creation (original behavior)
      const { id } = addTaskOptimistically(data)

      // Navigate to the new task page immediately
      router.push(`/tasks/${id}`)

      try {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...data, workerTeamConfig: data.workerTeam, id }), // Include the pre-generated ID
        })

        if (response.ok) {
          toast.success('Task created successfully!')
          // Refresh sidebar to get the real task data from server
          await refreshTasks()
        } else {
          const error = await response.json()
          // Show detailed message for rate limits, or generic error message
          toast.error(error.message || error.error || 'Failed to create task')
          // TODO: Remove the optimistic task on error
          await refreshTasks() // For now, just refresh to remove the optimistic task
        }
      } catch (error) {
        console.error('Error creating task:', error)
        toast.error('Failed to create task')
        // TODO: Remove the optimistic task on error
        await refreshTasks() // For now, just refresh to remove the optimistic task
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleVercelSignIn = async () => {
    setLoadingVercel(true)
    await redirectToSignIn()
  }

  const handleGitHubSignIn = () => {
    setLoadingGitHub(true)
    window.location.href = '/api/auth/signin/github'
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      <div className="p-3">
        <SharedHeader leftActions={headerLeftActions} initialStars={initialStars} />
      </div>

      {user ? (
        <div className="flex-1 overflow-y-auto px-4 pb-24 md:pb-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 py-6 lg:flex-row lg:items-start lg:justify-center">
            {/* ─── Pipeline Glow wrapper ─── */}
            <div
              className="w-full max-w-2xl lg:w-auto lg:flex-1 rounded-2xl opacity-0"
              style={{
                animation: 'fadeIn 0.6s ease-out 0.15s forwards',
                boxShadow: '0 0 0 1px oklch(0.62 0.185 65 / 0.12), 0 0 40px -16px oklch(0.62 0.185 65 / 0.06)',
              }}
            >
              <TaskForm
                onSubmit={handleTaskSubmit}
                isSubmitting={isSubmitting}
                selectedOwner={selectedOwner}
                selectedRepo={selectedRepo}
                initialInstallDependencies={initialInstallDependencies}
                initialMaxDuration={initialMaxDuration}
                initialKeepAlive={initialKeepAlive}
                initialEnableBrowser={initialEnableBrowser}
                maxSandboxDuration={maxSandboxDuration}
              />
            </div>
            <div
              className="w-full max-w-2xl lg:w-96 lg:shrink-0 opacity-0"
              style={{ animation: 'fadeIn 0.5s ease-out 0.4s forwards' }}
            >
              <QueuePanel />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-20 md:pb-4">
          {/* ─── Terminal Window ─── */}
          <div className="w-full max-w-2xl opacity-0" style={{ animation: 'fadeIn 0.6s ease-out 0.15s forwards' }}>
            <div
              className="rounded-2xl overflow-hidden border border-white/[0.06]"
              style={{
                background: 'oklch(0.15 0.01 255)',
                boxShadow: '0 0 0 1px oklch(0.62 0.185 65 / 0.08), 0 0 48px -12px oklch(0.62 0.185 65 / 0.04)',
              }}
            >
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                </div>
                <span className="flex-1 text-center text-[11px] text-white/25 font-mono">terminal — freebuff</span>
              </div>

              {/* Prompt area */}
              <div className="px-5 py-5 md:px-6 md:py-6">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 font-mono text-sm md:text-base text-amber-400/80 select-none">
                    $
                  </span>
                  <span className="font-mono text-sm md:text-base text-white/80 leading-relaxed">
                    {heroTyped}
                    <span
                      className={cn(
                        'inline-block w-[2px] h-[1.1em] align-text-bottom ms-0.5 -mb-0.5',
                        heroCursor ? 'bg-amber-400' : 'bg-transparent',
                      )}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 6-Agent Reveal ─── */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {HERO_AGENTS.map((agent) => (
              <div
                key={agent.name}
                className={cn(
                  'flex items-center gap-2 rounded-full border border-border/50 bg-card px-3 py-2 transition-all duration-500',
                  'hover:border-amber-500/20 hover:shadow-[0_0_0_1px_oklch(0.62_0.185_65_/_0.15)]',
                  !agentsRevealed && 'opacity-30 scale-90',
                  agentsRevealed && 'opacity-100 scale-100',
                )}
                style={{
                  transitionDelay: agentsRevealed ? `${agent.delay}ms` : '0ms',
                }}
              >
                <agent.Logo className="h-4 w-4 md:h-5 md:w-5" />
                <span className="text-xs md:text-sm font-medium text-foreground/80">{agent.name}</span>
              </div>
            ))}
          </div>

          {/* ─── CTA ─── */}
          <div
            className="mt-10 flex flex-col sm:flex-row items-center gap-3 opacity-0"
            style={{ animation: 'fadeIn 0.5s ease-out 0.8s forwards' }}
          >
            <Button
              onClick={() => setShowSignInDialog(true)}
              size="lg"
              className="h-12 px-8 text-base bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4 me-2 rtl:scale-x-[-1]" />
              {t.auth.signIn}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="h-12 px-6 text-base text-muted-foreground hover:text-foreground"
              asChild
            >
              <a href={VERCEL_DEPLOY_URL} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 76 65" className="h-3 w-3 me-2" fill="currentColor">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                {t.home.deployYourOwn}
              </a>
            </Button>
          </div>

          {/* ─── Nav links ─── */}
          <div
            className="mt-8 flex items-center gap-6 opacity-0"
            style={{ animation: 'fadeIn 0.5s ease-out 1s forwards' }}
          >
            <Link
              href="/landing"
              className="text-sm text-muted-foreground hover:text-amber-500 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
              Learn more
            </Link>
            <Link
              href="/capabilities"
              className="text-sm text-muted-foreground hover:text-amber-500 transition-colors flex items-center gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Capabilities
            </Link>
          </div>
        </div>
      )}

      {/* Mobile Footer with Stars and Deploy Button - Show when logged in OR when owner/repo are selected */}
      {(user || selectedOwner || selectedRepo) && <HomePageMobileFooter initialStars={initialStars} />}

      {/* Dialogs */}
      <OpenRepoUrlDialog open={showOpenRepoDialog} onOpenChange={setShowOpenRepoDialog} onSubmit={handleOpenRepoUrl} />
      <MultiRepoDialog open={showMultiRepoDialog} onOpenChange={setShowMultiRepoDialog} />

      {/* Sign In Dialog */}
      <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to continue</DialogTitle>
            <DialogDescription>
              {hasGitHub && hasVercel
                ? 'You need to sign in to create tasks. Choose how you want to sign in.'
                : hasVercel
                  ? 'You need to sign in with Vercel to create tasks.'
                  : 'You need to sign in with GitHub to create tasks.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            {hasVercel && (
              <Button
                onClick={handleVercelSignIn}
                disabled={loadingVercel || loadingGitHub}
                variant="outline"
                size="lg"
                className="w-full"
              >
                {loadingVercel ? (
                  <>
                    <svg
                      className="animate-spin -ms-1 me-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 76 65" className="h-3 w-3 me-2" fill="currentColor">
                      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                    </svg>
                    Sign in with Vercel
                  </>
                )}
              </Button>
            )}

            {hasGitHub && (
              <Button
                onClick={handleGitHubSignIn}
                disabled={loadingVercel || loadingGitHub}
                variant="outline"
                size="lg"
                className="w-full"
              >
                {loadingGitHub ? (
                  <>
                    <svg
                      className="animate-spin -ms-1 me-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <GitHubIcon className="h-4 w-4 me-2" />
                    Sign in with GitHub
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
