'use client'

import { useState, useEffect } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface CreatePRDialogProps {
  taskId: string
  defaultTitle?: string
  defaultBody?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPRCreated?: (prUrl: string, prNumber: number) => void
}

export function CreatePRDialog({
  taskId,
  defaultTitle = '',
  defaultBody = '',
  open,
  onOpenChange,
  onPRCreated,
}: CreatePRDialogProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [body, setBody] = useState(defaultBody)
  const [isCreating, setIsCreating] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    // Check if the device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error(t.errors.requiredField)
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}/pr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          baseBranch: 'main',
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        if (result.data.alreadyExists) {
          toast.info(t.toasts.alreadyExists)
        } else {
          toast.success(t.toasts.prCreated)
          if (onPRCreated && result.data.prUrl && result.data.prNumber) {
            onPRCreated(result.data.prUrl, result.data.prNumber)
          }
        }
        onOpenChange(false)
      } else {
        toast.error(result.error || t.errors.prCreate)
      }
    } catch (error) {
      console.error('Error creating PR:', error)
      toast.error(t.errors.prCreate)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t.dialogs.createPR.title}</DialogTitle>
          <DialogDescription>{t.dialogs.createPR.description}</DialogDescription>
        </DialogHeader>
        <form id="create-pr-form" onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid gap-2">
              <Label htmlFor="title">{t.dialogs.createPR.titleLabel} *</Label>
              <Input
                id="title"
                placeholder={t.dialogs.createPR.titlePlaceholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isCreating}
                autoFocus={!isMobile}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="body">{t.dialogs.createPR.descriptionLabel}</Label>
              <Textarea
                id="body"
                placeholder={t.dialogs.createPR.descriptionPlaceholder}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isCreating}
                className="min-h-[120px] max-h-[300px] resize-none"
              />
            </div>
          </div>
        </form>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isCreating}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="create-pr-form" disabled={isCreating || !title.trim()}>
            {isCreating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {isCreating ? t.dialogs.createPR.creating : t.dialogs.createPR.createButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
