'use client'

import { useState, useEffect, startTransition } from 'react'
import { useLocale } from '@/components/providers/locale-provider'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { CODING_AGENTS, AGENT_MODELS, DEFAULT_MODELS } from '@/lib/ai/model-definitions'

const AGENT_ICONS = {
  claude: Claude,
  codex: Codex,
  copilot: Copilot,
  cursor: Cursor,
  gemini: Gemini,
  opencode: OpenCode,
}

interface Commit {
  sha: string
  commit: {
    author: {
      name: string
      email: string
      date: string
    }
    message: string
  }
  author: {
    login: string
    avatar_url: string
  } | null
  html_url: string
}

interface RevertCommitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commit: Commit | null
  owner: string
  repo: string
  onRevert: (config: {
    commit: Commit
    selectedAgent: string
    selectedModel: string
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
  }) => void
  maxSandboxDuration?: number
}

export function RevertCommitDialog({
  open,
  onOpenChange,
  commit,
  owner,
  repo,
  onRevert,
  maxSandboxDuration = 300,
}: RevertCommitDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODELS.claude)
  const [installDependencies, setInstallDependencies] = useState(false)
  const [maxDuration, setMaxDuration] = useState(300)
  const [keepAlive, setKeepAlive] = useState(false)
  const [isReverting, setIsReverting] = useState(false)
  const { t } = useLocale()

  // Update model when agent changes
  useEffect(() => {
    if (selectedAgent) {
      const agentModels = AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]
      const defaultModel = DEFAULT_MODELS[selectedAgent as keyof typeof DEFAULT_MODELS]
      // Check if current model exists for the new agent, otherwise use default
      const modelExists = agentModels?.some((m) => m.value === selectedModel)
      if (!modelExists) {
        // Use startTransition to defer state update
        startTransition(() => {
          setSelectedModel(defaultModel)
        })
      }
    }
  }, [selectedAgent, selectedModel])

  const handleRevert = () => {
    if (!commit) return

    setIsReverting(true)
    onRevert({
      commit,
      selectedAgent,
      selectedModel,
      installDependencies,
      maxDuration,
      keepAlive,
    })
    setIsReverting(false)
    onOpenChange(false)
  }

  if (!commit) return null

  const commitShortSha = commit.sha.substring(0, 7)
  const commitMessage = commit.commit.message.split('\n')[0]

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t.dialogs.revertCommit.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.dialogs.revertCommit.description.replace('{sha}', commitShortSha).replace('{message}', commitMessage)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t.dialogs.revertCommit.agent}</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.dialogs.revertCommit.selectAgent} />
                </SelectTrigger>
                <SelectContent>
                  {CODING_AGENTS.map((agent) => {
                    const Icon = AGENT_ICONS[agent.value]
                    return (
                      <SelectItem key={agent.value} value={agent.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span>{agent.label}</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t.dialogs.revertCommit.model}</label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.dialogs.revertCommit.selectModel} />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_MODELS[selectedAgent as keyof typeof AGENT_MODELS]?.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  )) || []}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Task Options */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-3">{t.dialogs.revertCommit.taskOptions}</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="revert-install-deps"
                  checked={installDependencies}
                  onCheckedChange={(checked) => setInstallDependencies(!!checked)}
                />
                <Label
                  htmlFor="revert-install-deps"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t.dialogs.revertCommit.installDependencies}
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="revert-max-duration" className="text-sm font-medium">
                  {t.dialogs.revertCommit.maxDuration}
                </Label>
                <Select value={maxDuration.toString()} onValueChange={(value) => setMaxDuration(parseInt(value))}>
                  <SelectTrigger id="revert-max-duration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                    <SelectItem value="180">3 hours</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="300">5 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="revert-keep-alive"
                  checked={keepAlive}
                  onCheckedChange={(checked) => setKeepAlive(!!checked)}
                />
                <Label
                  htmlFor="revert-keep-alive"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t.dialogs.revertCommit.keepAlive.replace('{minutes}', maxSandboxDuration.toString())}
                </Label>
              </div>
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.dialogs.revertCommit.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={handleRevert} disabled={isReverting}>
            {isReverting ? t.dialogs.revertCommit.creating : t.dialogs.revertCommit.createTask}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
