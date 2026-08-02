'use client'

import { ArrowDown, ArrowUp, Clock, Eye, EyeOff, FlaskConical, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'cursor' | 'aigateway' | 'deepseek'
type FunctionKey = 'global' | 'prompt-optimizer' | 'proposals'

const PROVIDERS: Array<{ id: Provider; name: string; placeholder: string }> = [
  { id: 'aigateway', name: 'Vercel AI Gateway', placeholder: 'gw_…' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-…' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-…' },
  { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza…' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-…' },
  { id: 'cursor', name: 'Cursor', placeholder: 'cur_…' },
]

const FUNCTIONS: Array<{ id: FunctionKey; label: string; description: string }> = [
  {
    id: 'global',
    label: 'Main Agent',
    description: 'Fallback pool used by every agent when no function-specific key works.',
  },
  {
    id: 'prompt-optimizer',
    label: 'Prompt Enhancer',
    description: 'Used by optimizePrompt() before any task is submitted.',
  },
  {
    id: 'proposals',
    label: 'Proposal Generator',
    description: 'Used by generateProposals() to draft experiment ideas.',
  },
]

const MODELS_FOR_FUNCTION: Record<FunctionKey, Array<{ id: string; label: string }>> = {
  global: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (free)' },
    { id: 'o3-mini', label: 'o3-mini (free)' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free)' },
    { id: 'deepseek-chat', label: 'DeepSeek Chat (free)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (free)' },
  ],
  'prompt-optimizer': [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (free)' },
    { id: 'o3-mini', label: 'o3-mini (free)' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free)' },
    { id: 'deepseek-chat', label: 'DeepSeek Chat (free)' },
  ],
  proposals: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free)' },
    { id: 'deepseek-chat', label: 'DeepSeek Chat (free)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (free)' },
    { id: 'o3-mini', label: 'o3-mini (free)' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
  ],
}

type PoolEntry = {
  id: string
  provider: Provider
  label: string
  isExhausted: boolean
  usageCount: number
  lastUsedAt: string | null
  quotaWindowDay: string | null
  quotaResetMinutes: number | null
  exhaustedAt: string | null
}

type FunctionPool = {
  functionName: FunctionKey
  preferredProviders: Provider[]
  defaultModel: string
  keys: PoolEntry[]
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never used'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Never used'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return date.toLocaleDateString()
}

export function ApiPoolManager() {
  const [pools, setPools] = useState<FunctionPool[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FunctionKey>('prompt-optimizer')
  const fetchedOnce = useRef(false)

  const fetchPool = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/api-keys/pool')
      const data = await res.json()
      if (data.success) setPools(data.pool)
      else toast.error(data.error || 'Failed to load API pool')
    } catch (err) {
      console.error('Failed to load API pool', err)
      toast.error('Failed to load API pool')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!fetchedOnce.current) {
      fetchedOnce.current = true
      fetchPool()
    }
  }, [fetchPool])

  const activePool = pools.find((p) => p.functionName === activeTab) ?? {
    functionName: activeTab,
    preferredProviders: [],
    defaultModel: '',
    keys: [],
  }

  const onAdd = async (functionName: FunctionKey, provider: Provider, label: string, apiKey: string) => {
    const res = await fetch('/api/api-keys/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionName, provider, label, apiKey }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'Failed to save API key')
      return false
    }
    toast.success(`${PROVIDERS.find((p) => p.id === provider)?.name} key added`)
    return true
  }

  const onDelete = async (id: string) => {
    const res = await fetch(`/api/api-keys/pool?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Failed to delete key')
      return
    }
    toast.success('Key removed')
    await fetchPool()
  }

  const onTest = async (id: string) => {
    try {
      const res = await fetch('/api/api-keys/pool/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.success) toast.success('Key is healthy')
      else toast.error(data.error || 'Key is exhausted')
    } catch (err) {
      console.error(err)
      toast.error('Failed to test key')
    } finally {
      await fetchPool()
    }
  }

  const onSaveRouting = async (functionName: FunctionKey, preferredProviders: Provider[], defaultModel: string) => {
    const res = await fetch('/api/routing/functions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionName, preferredProviders, defaultModel }),
    })
    if (!res.ok) {
      toast.error('Failed to save routing')
      return
    }
    toast.success('Routing saved')
    await fetchPool()
  }

  const moveProvider = (idx: number, dir: -1 | 1) => {
    setPools((prev) =>
      prev.map((p) => {
        if (p.functionName !== activeTab) return p
        const next = [...p.preferredProviders]
        const swapWith = idx + dir
        if (swapWith < 0 || swapWith >= next.length) return p
        ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
        return { ...p, preferredProviders: next }
      }),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Pool</CardTitle>
        <CardDescription>
          Register one or more API keys per provider. Each function rotates between the keys you add, then falls back to
          the next provider in the order you set below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FunctionKey)} className="space-y-4">
          <TabsList className="flex flex-wrap">
            {FUNCTIONS.map((fn) => (
              <TabsTrigger key={fn.id} value={fn.id}>
                {fn.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {FUNCTIONS.map((fn) => (
            <TabsContent key={fn.id} value={fn.id} className="space-y-6">
              <p className="text-sm text-muted-foreground">{fn.description}</p>
              {loading && pools.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <PoolTab
                  pool={
                    activePool.functionName === fn.id
                      ? activePool
                      : { functionName: fn.id, preferredProviders: [], defaultModel: '', keys: [] }
                  }
                  providers={PROVIDERS.filter((p) => (fn.id === 'global' ? true : p.id !== 'cursor'))}
                  onAdd={(provider, label, apiKey) => onAdd(fn.id, provider, label, apiKey)}
                  onDelete={onDelete}
                  onTest={onTest}
                  onSaveRouting={(preferredProviders, defaultModel) =>
                    onSaveRouting(fn.id, preferredProviders, defaultModel)
                  }
                  onMoveProvider={moveProvider}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={fetchPool} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 me-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PoolTab({
  pool,
  providers,
  onAdd,
  onDelete,
  onTest,
  onSaveRouting,
  onMoveProvider,
}: {
  pool: FunctionPool
  providers: Array<{ id: Provider; name: string; placeholder: string }>
  onAdd: (provider: Provider, label: string, apiKey: string) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
  onTest: (id: string) => Promise<void>
  onSaveRouting: (preferredProviders: Provider[], defaultModel: string) => Promise<void>
  onMoveProvider: (idx: number, dir: -1 | 1) => void
}) {
  return (
    <div className="space-y-6">
      <RoutingSection
        preferredProviders={pool.preferredProviders}
        defaultModel={pool.defaultModel}
        providers={providers}
        modelOptions={MODELS_FOR_FUNCTION[pool.functionName]}
        onMove={onMoveProvider}
        onSave={async (preferred, model) => onSaveRouting(preferred, model)}
      />
      <KeyList keys={pool.keys} providers={providers} onTest={onTest} onDelete={onDelete} />
      <AddKeyForm providers={providers} onAdd={onAdd} />
    </div>
  )
}

function RoutingSection({
  preferredProviders,
  defaultModel,
  providers,
  modelOptions,
  onMove,
  onSave,
}: {
  preferredProviders: Provider[]
  defaultModel: string
  providers: Array<{ id: Provider; name: string; placeholder: string }>
  modelOptions: Array<{ id: string; label: string }>
  onMove: (idx: number, dir: -1 | 1) => void
  onSave: (preferred: Provider[], model: string) => Promise<void>
}) {
  const [draftOrder, setDraftOrder] = useState<Provider[]>(preferredProviders)
  const [draftModel, setDraftModel] = useState(defaultModel)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraftOrder(preferredProviders)
  }, [preferredProviders])

  useEffect(() => {
    setDraftModel(defaultModel)
  }, [defaultModel])

  const dirty = JSON.stringify(draftOrder) !== JSON.stringify(preferredProviders) || draftModel !== defaultModel

  return (
    <div className="rounded-md border p-4 space-y-4 bg-muted/30">
      <div className="space-y-1">
        <h4 className="font-medium text-sm">Provider order & default model</h4>
        <p className="text-xs text-muted-foreground">
          The first provider that has at least one healthy key is used. If all keys fail, we move to the next provider
          and so on. We loop back to the top after one full rotation.
        </p>
      </div>

      <div className="space-y-2">
        {draftOrder.length === 0 ? (
          <p className="text-xs text-muted-foreground">No providers configured yet.</p>
        ) : (
          draftOrder.map((p, idx) => {
            const provider = providers.find((x) => x.id === p)
            return (
              <div key={`${p}-${idx}`} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6">{idx + 1}.</span>
                <Badge variant="outline" className="min-w-32 justify-center">
                  {provider?.name ?? p}
                </Badge>
                <Input className="hidden" aria-hidden />
                <div className="flex items-center gap-1 ms-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onMove(idx, -1)}
                    disabled={idx === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onMove(idx, 1)}
                    disabled={idx === draftOrder.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Default model</Label>
          <Select value={draftModel} onValueChange={setDraftModel} disabled={saving}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(draftOrder, draftModel)
            } finally {
              setSaving(false)
            }
          }}
          disabled={!dirty || saving || draftOrder.length === 0}
          size="sm"
          className="w-full sm:w-auto"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin me-2" /> : null}
          Save routing
        </Button>
      </div>
    </div>
  )
}

function KeyList({
  keys,
  providers,
  onTest,
  onDelete,
}: {
  keys: PoolEntry[]
  providers: Array<{ id: Provider; name: string; placeholder: string }>
  onTest: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (keys.length === 0) {
    return <p className="text-sm text-muted-foreground">No keys for this function yet. Add one below.</p>
  }
  return (
    <div className="space-y-2">
      {keys.map((entry) => {
        const provider = providers.find((p) => p.id === entry.provider)
        return (
          <div
            key={entry.id}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-md border px-3 py-2',
              entry.isExhausted && 'border-destructive/30 bg-destructive/5',
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{entry.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {provider?.name ?? entry.provider}
                </Badge>
                {entry.isExhausted ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Exhausted
                  </Badge>
                ) : (
                  <Badge variant="default" className="text-[10px]">
                    Healthy
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {entry.usageCount} requests · last used {formatRelative(entry.lastUsedAt)}
                {entry.isExhausted && entry.exhaustedAt ? (
                  <span className="ms-2" title={PROVIDER_RESET_LABEL[entry.provider] ?? ''}>
                    <Clock className="h-3 w-3 inline me-0.5" />
                    resets {formatProviderReset(entry.provider, entry.exhaustedAt, entry.quotaResetMinutes)}
                  </span>
                ) : null}
                {entry.quotaWindowDay && entry.quotaWindowDay !== new Date().toISOString().slice(0, 10)
                  ? ` · window ${entry.quotaWindowDay}`
                  : null}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onTest(entry.id)}>
              <FlaskConical className="h-3.5 w-3.5 me-1.5" /> Test
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(entry.id)}>
              <Trash2 className="h-3.5 w-3.5 me-1.5 text-destructive" /> Remove
            </Button>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Provider-specific quota reset info (mirrors key-manager.ts schedules)
// ---------------------------------------------------------------------------

const PROVIDER_RESET_LABEL: Record<Provider, string> = {
  openai: '1st of month, midnight UTC',
  anthropic: '1st of month, midnight UTC',
  gemini: 'daily at 08:00 UTC (midnight Pacific)',
  deepseek: 'daily at 16:00 UTC (midnight Beijing)',
  cursor: '1st of month, midnight UTC',
  aigateway: 'daily at midnight UTC',
}

function computeProviderResetAt(provider: Provider, exhaustedAtIso: string | null): Date | null {
  if (!exhaustedAtIso) return null
  const exhausted = new Date(exhaustedAtIso)
  if (Number.isNaN(exhausted.getTime())) return null

  const label = PROVIDER_RESET_LABEL[provider]
  if (!label) return null

  if (label.startsWith('daily')) {
    // Parse the UTC hour from the label (e.g. "daily at 08:00 UTC ..." → 8)
    const match = label.match(/daily at (\d{1,2}):00 UTC/)
    const hour = match ? parseInt(match[1], 10) : 0
    const reset = new Date(exhausted)
    reset.setUTCHours(hour, 0, 0, 0)
    if (reset <= exhausted) {
      reset.setUTCDate(reset.getUTCDate() + 1)
    }
    return reset
  }

  // monthly: 1st of month, midnight UTC
  const reset = new Date(Date.UTC(exhausted.getUTCFullYear(), exhausted.getUTCMonth(), 1, 0, 0, 0))
  if (reset <= exhausted) {
    reset.setUTCMonth(reset.getUTCMonth() + 1)
  }
  return reset
}

function formatProviderReset(
  provider: Provider,
  exhaustedAtIso: string | null,
  quotaResetMinutes: number | null,
): string {
  if (!exhaustedAtIso) return ''

  if (quotaResetMinutes) {
    const exhaustedAt = new Date(exhaustedAtIso)
    const resetAt = new Date(exhaustedAt.getTime() + quotaResetMinutes * 60_000)
    const diff = resetAt.getTime() - Date.now()
    if (diff <= 0) return 'now'
    if (diff < 3_600_000) return `in ${Math.ceil(diff / 60_000)}m`
    if (diff < 86_400_000) return `in ${Math.round(diff / 3_600_000)}h`
    return resetAt.toLocaleString()
  }

  const resetAt = computeProviderResetAt(provider, exhaustedAtIso)
  if (!resetAt) return PROVIDER_RESET_LABEL[provider] ?? ''

  const diff = resetAt.getTime() - Date.now()
  if (diff <= 0) return 'any moment now'
  if (diff < 3_600_000) return `in ${Math.ceil(diff / 60_000)}m`
  if (diff < 86_400_000) return `in ${Math.round(diff / 3_600_000)}h`
  if (diff < 2_592_000_000) return `in ${Math.round(diff / 86_400_000)}d`
  return resetAt.toLocaleString()
}

function AddKeyForm({
  providers,
  onAdd,
}: {
  providers: Array<{ id: Provider; name: string; placeholder: string }>
  onAdd: (provider: Provider, label: string, apiKey: string) => Promise<boolean>
}) {
  const [provider, setProvider] = useState<Provider>('openai')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!label.trim() || !apiKey.trim()) {
      toast.error('Label and API key are required')
      return
    }
    setSaving(true)
    try {
      const ok = await onAdd(provider, label.trim(), apiKey.trim())
      if (ok) {
        setLabel('')
        setApiKey('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border p-4 space-y-3 bg-muted/20">
      <h4 className="font-medium text-sm">Add a key</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)} disabled={saving}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. primary"
            className="h-8"
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">API key</Label>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={providers.find((p) => p.id === provider)?.placeholder ?? ''}
              className="h-8 pe-9"
              disabled={saving}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              disabled={saving}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin me-2" /> : <Plus className="h-3.5 w-3.5 me-2" />}
          Add
        </Button>
      </div>
    </div>
  )
}
