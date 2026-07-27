'use client'

import { useState } from 'react'
import { useLocale } from '@/components/providers/locale-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'

interface MergePRDialogProps {
  taskId: string
  prUrl: string
  prNumber: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onPRMerged?: () => void
  onMergeInitiated?: () => void
}

export function MergePRDialog({
  taskId,
  prUrl,
  prNumber,
  open,
  onOpenChange,
  onPRMerged,
  onMergeInitiated,
}: MergePRDialogProps) {
  const { t } = useLocale()
  const [mergeMethod, setMergeMethod] = useState<'squash' | 'merge' | 'rebase'>('squash')
  const [isMerging, setIsMerging] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)

  const handleMergePR = async () => {
    setIsMerging(true)

    // Notify parent that merge is initiated (for loading state)
    if (onMergeInitiated) {
      onMergeInitiated()
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}/merge-pr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mergeMethod,
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        // Don't show toast here - parent will show it when status updates
        if (onPRMerged) {
          onPRMerged()
        }
        onOpenChange(false)
      } else {
        // Check if this is a merge conflict error
        // GitHub returns "Pull request is not mergeable" (405) or "Merge conflict - cannot auto-merge" (409)
        if (result.error && (result.error.includes('conflict') || result.error.includes('mergeable'))) {
          // Show the conflict resolution dialog
          setShowConflictDialog(true)
        } else {
          toast.error(result.error || t.errors.mergePR)
        }
      }
    } catch (error) {
      console.error('Error merging PR:', error)
      toast.error(t.errors.mergePR)
    } finally {
      setIsMerging(false)
    }
  }

  const handleAgentFixConflict = async () => {
    setIsSendingMessage(true)

    try {
      // Send a follow-up message to the current task to fix merge conflicts
      const response = await fetch(`/api/tasks/${taskId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message:
            'Fix merge conflicts in the current branch and prepare it for merging. Review the conflicting changes carefully and resolve them intelligently, preserving the intent of both sets of changes where possible.',
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast.success(t.toasts.agentFixingConflict)
        setShowConflictDialog(false)
        onOpenChange(false)
      } else {
        toast.error(result.error || t.errors.agentFixConflict)
      }
    } catch (error) {
      console.error('Error sending message to agent:', error)
      toast.error(t.errors.agentFixConflict)
    } finally {
      setIsSendingMessage(false)
    }
  }

  const handleCancelConflictDialog = () => {
    setShowConflictDialog(false)
    onOpenChange(false)
  }

  return (
    <>
      {/* Main Merge Dialog */}
      <Dialog open={open && !showConflictDialog} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t.dialogs.mergePR.title}</DialogTitle>
            <DialogDescription>
              {t.dialogs.mergePR.description.replace('{prNumber}', prNumber.toString())}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mergeMethod">{t.dialogs.mergePR.mergeMethod}</Label>
              <Select
                value={mergeMethod}
                onValueChange={(value: 'squash' | 'merge' | 'rebase') => setMergeMethod(value)}
                disabled={isMerging}
              >
                <SelectTrigger id="mergeMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="squash">{t.dialogs.mergePR.squash}</SelectItem>
                  <SelectItem value="merge">{t.dialogs.mergePR.merge}</SelectItem>
                  <SelectItem value="rebase">{t.dialogs.mergePR.rebase}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleMergePR} disabled={isMerging}>
              {isMerging && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {isMerging ? t.dialogs.mergePR.merging : t.dialogs.mergePR.merge}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Conflict Resolution Dialog */}
      <Dialog
        open={open && showConflictDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowConflictDialog(false)
          }
          onOpenChange(isOpen)
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {t.dialogs.mergeConflict.title}
            </DialogTitle>
            <DialogDescription>{t.dialogs.mergeConflict.description}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{t.dialogs.mergeConflict.agentWill}</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
              <li>{t.dialogs.mergeConflict.analyzeChanges}</li>
              <li>{t.dialogs.mergeConflict.intelligentlyMerge}</li>
              <li>{t.dialogs.mergeConflict.createCommit}</li>
              <li>{t.dialogs.mergeConflict.pushChanges}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelConflictDialog} disabled={isSendingMessage}>
              {t.dialogs.mergeConflict.cancel}
            </Button>
            <Button onClick={handleAgentFixConflict} disabled={isSendingMessage}>
              {isSendingMessage && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {isSendingMessage ? t.dialogs.mergeConflict.sendingMessage : t.dialogs.mergeConflict.fixWithAgent}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
