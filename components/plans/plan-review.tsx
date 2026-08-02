'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Check, X, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TaskPlan } from '@/lib/db/schema'

interface PlanReviewProps {
  taskId: string
  onReviewed?: () => void
}

export function PlanReview({ taskId, onReviewed }: PlanReviewProps) {
  const [plans, setPlans] = useState<TaskPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/plans`)
        if (response.ok) {
          const data = await response.json()
          setPlans(data)
        }
      } catch (error) {
        console.error('Failed to fetch plans')
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [taskId])

  const handleAction = async (planId: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !feedback.trim()) {
      toast.error('Please provide feedback for rejection')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/tasks/${taskId}/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, feedback }),
      })

      if (response.ok) {
        toast.success(`Plan ${action}d successfully`)
        if (onReviewed) onReviewed()
      } else {
        toast.error(`Failed to ${action} plan`)
      }
    } catch (error) {
      toast.error('An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    )

  const activePlan = plans.find((p) => p.status === 'pending_approval')

  if (!activePlan) return null

  return (
    <Card className="w-full mt-4 border-yellow-500/50 bg-yellow-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-500" />
          Plan Approval Required (v{activePlan.version})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose dark:prose-invert max-w-none text-sm">
          <h4>Objective: {activePlan.planContent.objective}</h4>
          <ol className="mt-2 space-y-2">
            {activePlan.planContent.steps?.map((step) => (
              <li key={step.id} className="p-2 bg-background rounded-md border">
                {step.description}
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2 mt-4">
          <label htmlFor="plan-feedback" className="text-sm font-medium">
            Feedback (Required for rejection)
          </label>
          <Textarea
            id="plan-feedback"
            placeholder="Tell the agent what to change..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
          onClick={() => handleAction(activePlan.id, 'reject')}
          disabled={isSubmitting || !feedback.trim()}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <X className="w-4 h-4 me-2" />}
          Reject & Revise
        </Button>
        <Button
          className="bg-green-500 hover:bg-green-600 text-white"
          onClick={() => handleAction(activePlan.id, 'approve')}
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Check className="w-4 h-4 me-2" />}
          Approve & Execute
        </Button>
      </CardFooter>
    </Card>
  )
}
