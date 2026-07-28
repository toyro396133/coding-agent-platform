'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import type { ProjectRule } from '@/lib/db/schema'

export default function RulesPage({ params }: { params: { owner: string; repo: string } }) {
  const [rules, setRules] = useState<ProjectRule[]>([])
  const [loading, setLoading] = useState(true)
  const [newRule, setNewRule] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchRules = async () => {
    try {
      const res = await fetch(`/api/repos/${params.owner}/${params.repo}/rules`)
      if (res.ok) {
        setRules(await res.json())
      }
    } catch (error) {
      toast.error('Failed to load rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [params.owner, params.repo])

  const handleAddRule = async () => {
    if (!newRule.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/repos/${params.owner}/${params.repo}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleContent: newRule }),
      })
      if (res.ok) {
        toast.success('Rule added successfully')
        setNewRule('')
        fetchRules()
      } else {
        toast.error('Failed to add rule')
      }
    } catch (error) {
      toast.error('Error adding rule')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleApproval = async (ruleId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/repos/${params.owner}/${params.repo}/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: !currentStatus }),
      })
      if (res.ok) {
        fetchRules()
        toast.success(`Rule ${!currentStatus ? 'approved' : 'unapproved'}`)
      }
    } catch (error) {
      toast.error('Failed to update rule')
    }
  }

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      const res = await fetch(`/api/repos/${params.owner}/${params.repo}/rules/${ruleId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchRules()
        toast.success('Rule deleted')
      }
    } catch (error) {
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
          agent's prompts.
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
