'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { fetchProposals, updateProposalStatus } from '@/lib/actions/proposals'
import { fetchBackgroundTests, toggleTestEnabled } from '@/lib/actions/tests'
import { Proposal, BackgroundTest } from '@/lib/db/schema'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'

export function InteractiveTaskPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [backgroundTests, setBackgroundTests] = useState<BackgroundTest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true)
        const [fetchedProposals, fetchedTests] = await Promise.all([fetchProposals(), fetchBackgroundTests()])
        setProposals(fetchedProposals)
        setBackgroundTests(fetchedTests)
      } catch (err) {
        console.error('Failed to load interactive task panel data')
        toast.error('Failed to load panel data')
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

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
                        <X className="h-3 w-3 mr-1" /> Decline
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleUpdateProposal(proposal.id, 'accepted')}
                      >
                        <Check className="h-3 w-3 mr-1" /> Accept
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

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
