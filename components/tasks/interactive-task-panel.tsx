'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { fetchProposals, updateProposalStatus } from '@/lib/actions/proposals'
import { fetchBackgroundTests, toggleTestEnabled, fetchBackgroundTestExecutionsByTaskId } from '@/lib/actions/tests'
import { Proposal, BackgroundTest } from '@/lib/db/schema'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { getDictionary, Locale } from '@/dictionaries'
import { redactSensitiveInfo } from '@/lib/utils/logging'

/**
 * Displays proposals, test executions, and background tests with controls for updating proposal statuses and enabling or disabling tests.
 *
 * @param taskId - Optional task identifier used to load its test executions
 * @param locale - Locale used for translating execution statuses
 */
export function InteractiveTaskPanel({ taskId, locale = 'he' }: { taskId?: string; locale?: Locale }) {
  const t = getDictionary(locale)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [backgroundTests, setBackgroundTests] = useState<BackgroundTest[]>([])
  const [executions, setExecutions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    /**
     * Loads proposals, background tests, and task-related test executions into the panel.
     *
     * Displays an error notification if loading fails.
     */
    async function loadData() {
      try {
        setIsLoading(true)
        const [fetchedProposals, fetchedTests, fetchedExecutions] = await Promise.all([
          fetchProposals(),
          fetchBackgroundTests(),
          taskId ? fetchBackgroundTestExecutionsByTaskId(taskId) : Promise.resolve([]),
        ])
        setProposals(fetchedProposals)
        setBackgroundTests(fetchedTests)
        setExecutions(fetchedExecutions)
      } catch (err) {
        console.error('Failed to load interactive task panel data')
        toast.error('Failed to load panel data')
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [taskId])

  const handleUpdateProposal = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await updateProposalStatus(id, status)
      setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
      toast.success(`Proposal ${status}`)
    } catch (err) {
      console.error('Failed to update proposal')
      toast.error('Failed to update proposal')
    }
  }

  const handleToggleTest = async (id: string, isEnabled: boolean) => {
    try {
      await toggleTestEnabled(id, isEnabled)
      setBackgroundTests((prev) => prev.map((t) => (t.id === id ? { ...t, isEnabled } : t)))
      toast.success(`Test ${isEnabled ? 'enabled' : 'disabled'}`)
    } catch (err) {
      console.error('Failed to toggle test')
      toast.error('Failed to toggle test')
    }
  }

  if (isLoading) {
    return (
      <Card className="h-full flex items-center justify-center border-none shadow-none bg-transparent">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="space-y-4">
        <h3 className="font-semibold text-sm tracking-tight">Proposals</h3>
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proposals available.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <Card key={proposal.id} className="text-sm">
                <CardHeader className="p-3 pb-2 flex flex-row items-start justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">{proposal.title}</CardTitle>
                  {proposal.status !== 'pending' && proposal.status !== null ? (
                    <Badge variant={proposal.status === 'accepted' ? 'default' : 'secondary'} className="text-[10px]">
                      {proposal.status}
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="text-xs text-muted-foreground mb-3">{proposal.description}</p>

                  {proposal.tags && proposal.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {proposal.tags.map((tag) => (
                        <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {(proposal.status === 'pending' || proposal.status === null) && (
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleUpdateProposal(proposal.id, 'rejected')}
                      >
                        <X className="h-3 w-3 me-1" /> Decline
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleUpdateProposal(proposal.id, 'accepted')}
                      >
                        <Check className="h-3 w-3 me-1" /> Accept
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {executions.length > 0 && (
        <div className="space-y-4 mt-4">
          <h3 className="font-semibold text-sm tracking-tight">{t.testExecutions}</h3>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {executions.map((exec) => (
              <AccordionItem key={exec.id} value={exec.id} className="border rounded-md px-3 bg-card">
                <AccordionTrigger className="hover:no-underline py-2 text-sm flex gap-2">
                  <div className="flex items-center gap-2 w-full text-start">
                    <Badge
                      variant={
                        exec.status === 'passed' ? 'default' : exec.status === 'failed' ? 'destructive' : 'secondary'
                      }
                      className="text-[10px]"
                    >
                      {t[exec.status as keyof typeof t] || exec.status}
                    </Badge>
                    <span className="font-medium truncate">{exec.testId}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-3">
                  <div className="text-xs text-muted-foreground bg-muted p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap font-mono">
                    {exec.logs ? redactSensitiveInfo(exec.logs) : t.noLogsAvailable}
                  </div>
                  {exec.remediationPatch && (
                    <div className="mt-2 text-xs">
                      <p className="font-semibold mb-1">{t.remediationApplied}:</p>
                      <pre className="bg-muted p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap font-mono">
                        {redactSensitiveInfo(JSON.stringify(exec.remediationPatch, null, 2))}
                      </pre>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      <div className="space-y-4 mt-4">
        <h3 className="font-semibold text-sm tracking-tight">Background Tests</h3>
        {backgroundTests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No background tests available.</p>
        ) : (
          <div className="space-y-3">
            {backgroundTests.map((test) => (
              <Card key={test.id} className="text-sm">
                <CardContent className="p-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{test.name}</p>
                    {test.description && <p className="text-xs text-muted-foreground mt-0.5">{test.description}</p>}
                  </div>
                  <Switch
                    checked={test.isEnabled ?? false}
                    onCheckedChange={(checked) => handleToggleTest(test.id, checked)}
                    aria-label={`Toggle ${test.name} test`}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
