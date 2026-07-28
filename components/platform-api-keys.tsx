'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Key, Trash2, Copy, Check } from 'lucide-react'

type PlatformApiKey = {
  id: string
  name: string
  hint: string
  createdAt: string
}

export function PlatformApiKeys() {
  const [keys, setKeys] = useState<PlatformApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{ name: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [fetchSequence, setFetchSequence] = useState(0)

  const fetchKeys = async (currentSequence: number) => {
    try {
      const res = await fetch('/api/user/platform-keys')
      if (res.ok) {
        const data = await res.json()
        // Only update state if this is still the current fetch sequence
        setKeys((prev) => {
          if (currentSequence >= fetchSequence) {
            return data.apiKeys || []
          }
          return prev
        })
      } else {
        toast.error('Failed to load API keys')
      }
    } catch (error) {
      console.error('Error fetching keys')
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const currentSeq = fetchSequence
    fetchKeys(currentSeq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSequence])

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return

    setCreating(true)
    try {
      const res = await fetch('/api/user/platform-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      })

      if (res.ok) {
        const data = await res.json()
        setNewlyCreatedKey(data.key)
        setNewKeyName('')
        setFetchSequence((seq) => seq + 1) // Trigger refresh
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to create key')
      }
    } catch (error) {
      console.error('Error creating key')
      toast.error('Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this key? Any application using it will stop working immediately.')) {
      return
    }

    try {
      const res = await fetch(`/api/user/platform-keys?id=${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('API key revoked')
        setKeys((prev) => prev.filter((k) => k.id !== id))
      } else {
        toast.error('Failed to revoke key')
      }
    } catch (error) {
      toast.error('Error revoking key')
    }
  }

  const copyToClipboard = async () => {
    if (newlyCreatedKey?.value) {
      try {
        await navigator.clipboard.writeText(newlyCreatedKey.value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        toast.error('Failed to copy to clipboard')
      }
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Platform API Keys</CardTitle>
          <CardDescription>
            These keys allow external applications (like Cursor or CLI tools) to authenticate with this platform and
            create sandboxes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleCreateKey} className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label htmlFor="keyName" className="text-sm font-medium">
                Key Name
              </label>
              <Input
                id="keyName"
                placeholder="e.g. Cursor Plugin, CLI, Testing"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                disabled={creating}
              />
            </div>
            <Button type="submit" disabled={!newKeyName.trim() || creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
              Create new key
            </Button>
          </form>

          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center p-8 border rounded-lg bg-muted/20">
              <p className="text-muted-foreground">No API keys generated yet.</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <div className="border rounded-md">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Key Hint</th>
                      <th className="px-4 py-2 font-medium">Created</th>
                      <th className="px-4 py-2 font-medium w-[100px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.id} className="border-t">
                        <td className="px-4 py-2 font-medium">{key.name}</td>
                        <td className="px-4 py-2">
                          <code className="bg-muted px-2 py-1 rounded text-xs">{key.hint}</code>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteKey(key.id)}
                            aria-label="Revoke API key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!newlyCreatedKey} onOpenChange={(open) => !open && setNewlyCreatedKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Please save this secret key somewhere safe and accessible. For security reasons,{' '}
              <strong>you won&apos;t be able to view it again</strong> through your account. If you lose this secret
              key, you&apos;ll need to generate a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center space-x-2 my-4">
            <div className="grid flex-1 gap-2">
              <Input
                id="raw-key"
                value={newlyCreatedKey?.value || ''}
                readOnly
                className="font-mono text-sm bg-muted"
              />
            </div>
            <Button size="icon" onClick={copyToClipboard} variant="outline" aria-label="Copy API key">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <DialogFooter className="sm:justify-end">
            <Button type="button" onClick={() => setNewlyCreatedKey(null)}>
              I saved my key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
