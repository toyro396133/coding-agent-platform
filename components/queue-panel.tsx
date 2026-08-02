'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowDown, ArrowUp, Bot, Combine, ListOrdered, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from '@/components/providers/locale-provider'
import { SkeletonCardList } from '@/components/skeleton-card-list'
import { cn } from '@/lib/utils'

interface QueueItem {
  id: string
  prompt: string
  title: string | null
  repoUrl: string | null
  selectedAgent: string
  status: 'queued' | 'processing' | 'completed' | 'error' | 'stopped'
  source: 'user' | 'agent'
  position: number
  taskId: string | null
  notes: string | null
  createdAt: string
}

const STATUS_STYLES: Record<QueueItem['status'], string> = {
  queued: 'bg-secondary text-secondary-foreground border-transparent',
  processing: 'bg-amber-500/15 text-amber-600 border-transparent',
  completed: 'bg-emerald-500/15 text-emerald-600 border-transparent',
  error: 'bg-red-500/15 text-red-600 border-transparent',
  stopped: 'bg-muted text-muted-foreground border-transparent',
}

function shortRepo(repoUrl: string | null): string {
  if (!repoUrl) return ''
  try {
    const url = new URL(repoUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 2) return `${parts[0]}/${parts[1].replace(/\.git$/, '')}`
  } catch {
    // fall through
  }
  return ''
}

export function QueuePanel({ className }: { className?: string }) {
  const { t } = useLocale()
  const [items, setItems] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [editing, setEditing] = useState<QueueItem | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isMutating, setIsMutating] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/queue')
      if (response.ok) {
        const data = await response.json()
        setItems(data.queue || [])
      }
    } catch (error) {
      console.error('Error fetching queue:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  // Initial fetch + polling (so auto-advance is reflected live)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue()
    const interval = setInterval(fetchQueue, 10000)
    const onQueueChanged = () => fetchQueue()
    window.addEventListener('queue-changed', onQueueChanged)
    return () => {
      clearInterval(interval)
      window.removeEventListener('queue-changed', onQueueChanged)
    }
  }, [fetchQueue])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchQueue()
  }

  const reorder = async (item: QueueItem, direction: -1 | 1) => {
    setIsMutating(item.id)
    try {
      const response = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, position: item.position + direction }),
      })
      if (response.ok) {
        toast.success(t.queue.reordered)
        await fetchQueue()
      } else {
        toast.error(t.errors.failedToFetchQueue)
      }
    } catch (error) {
      console.error('Error reordering queue:', error)
      toast.error(t.errors.failedToFetchQueue)
    } finally {
      setIsMutating(null)
    }
  }

  const remove = async (item: QueueItem) => {
    setIsMutating(item.id)
    try {
      const response = await fetch(`/api/queue?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      if (response.ok) {
        toast.success(t.queue.removed)
        await fetchQueue()
      } else {
        toast.error(t.errors.failedToFetchQueue)
      }
    } catch (error) {
      console.error('Error removing queue item:', error)
      toast.error(t.errors.failedToFetchQueue)
    } finally {
      setIsMutating(null)
    }
  }

  const openEdit = (item: QueueItem) => {
    setEditing(item)
    setEditPrompt(item.prompt)
    setEditTitle(item.title || '')
  }

  const saveEdit = async () => {
    if (!editing) return
    if (!editPrompt.trim()) return
    setIsSaving(true)
    try {
      const response = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, prompt: editPrompt.trim(), title: editTitle.trim() || null }),
      })
      if (response.ok) {
        toast.success(t.queue.updated)
        setEditing(null)
        await fetchQueue()
      } else {
        toast.error(t.errors.failedToFetchQueue)
      }
    } catch (error) {
      console.error('Error updating queue item:', error)
      toast.error(t.errors.failedToFetchQueue)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedItems = items.filter((item) => selectedIds.has(item.id))
  const isMergeMode = selectedIds.size >= 2

  const executeMerge = async () => {
    if (!mergeTargetId || selectedItems.length < 2) return

    setIsMutating('merge')
    try {
      const response = await fetch('/api/queue?action=merge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: mergeTargetId,
          mergeIds: selectedItems.map((item) => item.id).filter((id) => id !== mergeTargetId),
        }),
      })
      if (response.ok) {
        toast.success(t.queue.merged)
        setSelectedIds(new Set())
        setMergeTargetId(null)
        await fetchQueue()
      } else {
        toast.error(t.errors.failedToFetchQueue)
      }
    } catch (error) {
      console.error('Error merging queue:', error)
      toast.error(t.errors.failedToFetchQueue)
    } finally {
      setIsMutating(null)
    }
  }

  const activeCount = items.filter((i) => i.status === 'queued' || i.status === 'processing').length

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="flex-row items-center justify-between !gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="h-4 w-4 text-primary" />
            {t.queue.title}
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t.queue.subtitle}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {isMergeMode && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selectedItems.length} {t.queue.selected}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
                disabled={isMutating === 'merge'}
              >
                {t.queue.clearSelection}
              </Button>
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => setMergeTargetId(selectedItems[0]?.id || null)}
                disabled={isMutating === 'merge'}
              >
                <Combine className="h-3.5 w-3.5 me-1" />
                {t.queue.mergeSelected}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <SkeletonCardList count={3} />
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t.queue.empty}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">{t.queue.emptyHint}</p>
          </div>
        ) : (
          items.map((item) => {
            const isBusy = isMutating === item.id
            const isMergeBusy = isMutating === 'merge'
            const repo = shortRepo(item.repoUrl)
            const displayTitle = item.title || item.prompt.slice(0, 90) + (item.prompt.length > 90 ? '…' : '')
            const isSelected = selectedIds.has(item.id)
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 transition-colors',
                  item.status === 'processing' && 'border-amber-300/60 bg-amber-500/5',
                  item.status === 'error' && 'border-red-300/60 bg-red-500/5',
                  item.status === 'completed' && 'border-emerald-300/40 bg-emerald-500/5',
                  item.status === 'stopped' && 'opacity-60',
                  isSelected && 'bg-primary/5 border-primary/30',
                )}
              >
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    disabled={isBusy || item.position === 0}
                    onClick={() => reorder(item, -1)}
                    title={t.queue.moveUp}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums">#{item.position}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    disabled={isBusy || item.position === items.length - 1}
                    onClick={() => reorder(item, 1)}
                    title={t.queue.moveDown}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{displayTitle}</span>
                    <Badge variant="outline" className={cn('h-4 px-1.5 text-[10px]', STATUS_STYLES[item.status])}>
                      {t.queue[item.status]}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 text-[10px] text-muted-foreground flex items-center gap-0.5"
                      title={item.source === 'agent' ? t.queue.agentAdded : t.queue.user}
                    >
                      {item.source === 'agent' ? <Bot className="h-3 w-3" /> : null}
                      {item.source === 'agent' ? t.queue.agent : t.queue.user}
                    </Badge>
                  </div>
                  {repo && <p className="mt-0.5 truncate text-xs text-muted-foreground">{repo}</p>}
                  {item.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{item.notes}</p>}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <div className="flex items-center px-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(item.id)}
                      disabled={isBusy || isMergeBusy || item.status === 'processing' || item.status === 'completed'}
                      aria-label={`${t.queue.merge} ${displayTitle}`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={isBusy || item.status === 'processing' || item.status === 'completed'}
                    onClick={() => openEdit(item)}
                    title={t.queue.edit}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    disabled={isBusy}
                    onClick={() => remove(item)}
                    title={t.queue.delete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.queue.edit}</DialogTitle>
            <DialogDescription>{t.queue.editHint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="queue-edit-title">{t.queue.titleLabel}</Label>
              <Input
                id="queue-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t.queue.titlePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="queue-edit-prompt">{t.queue.promptLabel}</Label>
              <Textarea
                id="queue-edit-prompt"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isSaving}>
              {t.common.cancel}
            </Button>
            <Button onClick={saveEdit} disabled={isSaving || !editPrompt.trim()}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeTargetId} onOpenChange={(open) => !open && setMergeTargetId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.queue.mergeSelected}</DialogTitle>
            <DialogDescription>{t.queue.mergeHint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {selectedItems.map((item) => (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                  mergeTargetId === item.id && 'bg-primary/5 border-primary/50',
                )}
              >
                <input
                  type="radio"
                  name="merge-target"
                  checked={mergeTargetId === item.id}
                  onChange={() => setMergeTargetId(item.id)}
                  className="h-4 w-4 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.title || item.prompt.slice(0, 80) + (item.prompt.length > 80 ? '…' : '')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.id === mergeTargetId ? t.queue.mergeTarget : t.queue.selectTarget}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeTargetId(null)} disabled={isMutating === 'merge'}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={executeMerge}
              disabled={isMutating === 'merge' || !mergeTargetId || selectedItems.length < 2}
            >
              {isMutating === 'merge' ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : (
                <Combine className="h-4 w-4 me-2" />
              )}
              {t.queue.merge}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
