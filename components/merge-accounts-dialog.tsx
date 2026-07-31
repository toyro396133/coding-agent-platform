'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLocale } from '@/components/providers/locale-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Link2, AlertCircle, Clock } from 'lucide-react'

interface PendingMerge {
  tokenId: string
  newProvider: string
  newUsername: string
  matchedEmail: string
  expiresAt: string
}

export function MergeAccountsDialog() {
  const { t } = useLocale()
  const [pendingMerges, setPendingMerges] = useState<PendingMerge[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMerging, setIsMerging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Fetch pending merges on mount
  useEffect(() => {
    let cancelled = false
    async function fetchPending() {
      try {
        const res = await fetch('/api/auth/merge/pending')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setPendingMerges(data.merges || [])
            if (data.merges?.length > 0) {
              setOpen(true)
            }
          }
        }
      } catch {
        // Silently fail — the dialog simply won't show
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchPending()
    return () => {
      cancelled = true
    }
  }, [])

  const handleConfirm = useCallback(
    async (tokenId: string) => {
      setIsMerging(tokenId)
      setError(null)
      try {
        const res = await fetch('/api/auth/merge/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId }),
        })
        if (res.ok) {
          setPendingMerges((prev) => prev.filter((m) => m.tokenId !== tokenId))
          if (pendingMerges.length <= 1) {
            setOpen(false)
          }
        } else {
          const data = await res.json()
          setError(data.error || 'Failed to link accounts')
        }
      } catch {
        setError('Failed to link accounts')
      } finally {
        setIsMerging(null)
      }
    },
    [pendingMerges.length],
  )

  const handleReject = useCallback(
    async (tokenId: string) => {
      try {
        await fetch('/api/auth/merge/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId }),
        })
      } catch {
        // Best-effort
      }
      setPendingMerges((prev) => prev.filter((m) => m.tokenId !== tokenId))
      if (pendingMerges.length <= 1) {
        setOpen(false)
      }
    },
    [pendingMerges.length],
  )

  const formatProvider = (provider: string) => {
    switch (provider) {
      case 'github':
        return 'GitHub'
      case 'google':
        return 'Google'
      case 'discord':
        return 'Discord'
      default:
        return provider
    }
  }

  const getHoursUntilExpiry = useCallback((expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    return Math.max(0, Math.round(diff / 3600000))
  }, [])

  if (pendingMerges.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Link2 className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">{t.dialogs.mergeAccounts.title}</DialogTitle>
          <DialogDescription className="text-center">
            {pendingMerges.length === 1
              ? t.dialogs.mergeAccounts.description
                  .replace('{targetProvider}', formatProvider(pendingMerges[0].newProvider))
                  .replace('{newProvider}', formatProvider(pendingMerges[0].newProvider))
              : `${pendingMerges.length} pending account link requests`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {pendingMerges.map((merge) => (
            <div key={merge.tokenId} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{formatProvider(merge.newProvider)}</p>
                  <p className="text-sm text-muted-foreground">@{merge.newUsername}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {t.dialogs.mergeAccounts.expiresIn.replace('{hours}', String(getHoursUntilExpiry(merge.expiresAt)))}
                  </span>
                </div>
              </div>

              {getHoursUntilExpiry(merge.expiresAt) === 0 ? (
                <p className="text-sm text-destructive">{t.dialogs.mergeAccounts.expired}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t.dialogs.mergeAccounts.whatHappens}</p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>{t.dialogs.mergeAccounts.benefit1}</li>
                    <li>{t.dialogs.mergeAccounts.benefit2}</li>
                    <li>{t.dialogs.mergeAccounts.benefit3}</li>
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              for (const merge of pendingMerges) {
                handleReject(merge.tokenId)
              }
            }}
            disabled={isMerging !== null}
          >
            {t.dialogs.mergeAccounts.rejectMerge}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              for (const merge of pendingMerges) {
                handleConfirm(merge.tokenId)
              }
            }}
            disabled={isMerging !== null}
          >
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.dialogs.mergeAccounts.merging}
              </>
            ) : (
              t.dialogs.mergeAccounts.confirmMerge
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
