'use client'

import { CheckCircle2, Circle, Loader2, Trash2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { ProjectRule } from '@/lib/db/schema'

export default function RulesPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const unwrappedParams = React.use(params)
  const [rules, setRules] = useState<ProjectRule[]>([])
  const [loading, setLoading] = useState(true)
  const [newRule, setNewRule] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchRules = async (abortSignal: AbortSignal) => {
    try {
      const res = await fetch(`/api/repos/${unwrappedParams.owner}/${unwrappedParams.repo}/rules`, {
        signal: abortSignal,
      })
      if (res.ok) {
        const data = await res.json()
        if (!abortSignal.aborted) {
          setRules(data)
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError' && !abortSignal.aborted) {
        toast.error('Failed to load rules')
      }
    } finally {
      if (!abortSignal.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchRules(controller.signal)
    return () => controller.abort()
  }, [fetchRules])

  const handleAddRule = async () => {
    if (!newRule.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/repos/${unwrappedParams.owner}/${unwrappedParams.repo}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleContent: newRule }),
      })
      if (res.ok) {
        toast.success('Rule added successfully')
        setNewRule('')
        const controller = new AbortController()
        fetchRules(controller.signal)
      } else {
        toast.error('Failed to add rule')
      }
    } catch (_error) {
      toast.error('Error adding rule')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleApproval = async (ruleId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/repos/${unwrappedParams.owner}/${unwrappedParams.repo}/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: !currentStatus }),
      })
      if (res.ok) {
        const controller = new AbortController()
        fetchRules(controller.signal)
        toast.success(`Rule ${!currentStatus ? 'approved' : 'unapproved'}`)
      } else {
        toast.error('Failed to update rule')
      }
    } catch (_error) {
      toast.error('Failed to update rule')
    }
  }

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      const res = await fetch(`/api/repos/${unwrappedParams.owner}/${unwrappedParams.repo}/rules/${ruleId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const controller = new AbortController()
        fetchRules(controller.signal)
        toast.success('Rule deleted')
      } else {
        toast.error('Failed to delete rule')
      }
    } catch (_error) {
      toast.error('Failed to delete rule')
    }
  }

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )

  const approvedRules = rules.filter((r) => r.isApproved)
  const pendingRules = rules.filter((r) => !r.isApproved)

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Rules</h1>
        <p className="text-muted-foreground mt-2">
          Manage long-term memory and rules for this repository. These rules are injected as untrusted context into the
          agent&apos;s prompts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Rule</CardTitle>
          <CardDescription>Manually add a new rule for the agent to follow in this repository.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g. Always use Tailwind logical properties (ms-4 instead of ml-4) for RTL support."
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            rows={3}
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleAddRule} disabled={isSubmitting || !newRule.trim()}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add Rule
          </Button>
        </CardFooter>
      </Card>

      {pendingRules.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Rules (Extracted from Tasks)</h2>
          <div className="grid gap-4">
            {pendingRules.map((rule) => (
              <Card key={rule.id} className="border-yellow-500/50">
                <CardContent className="pt-6 flex justify-between items-start gap-4">
                  <p className="text-sm">{rule.ruleContent}</p>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="text-green-500 hover:text-green-600"
                      onClick={() => toggleApproval(rule.id, rule.isApproved)}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Active Rules</h2>
        {approvedRules.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active rules for this repository.</p>
        ) : (
          <div className="grid gap-4">
            {approvedRules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="pt-6 flex justify-between items-start gap-4">
                  <p className="text-sm">{rule.ruleContent}</p>
                  <div className="flex gap-2 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => toggleApproval(rule.id, rule.isApproved)}>
                      <Circle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
