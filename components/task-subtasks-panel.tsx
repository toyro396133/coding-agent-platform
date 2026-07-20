import React from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, CircleDashed, AlertCircle, PlayCircle } from 'lucide-react'
import { SubTask } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface TaskSubTasksPanelProps {
  subTasks: SubTask[] | null
  onClarificationSubmit?: (subTaskId: string, answer: string) => Promise<void>
}

export function TaskSubTasksPanel({ subTasks, onClarificationSubmit }: TaskSubTasksPanelProps) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState<string | null>(null)

  if (!subTasks || subTasks.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Task Breakdown</CardTitle>
          <CardDescription>The agent hasn&apos;t broken down this task into steps yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const handleAnswerSubmit = async (subTaskId: string) => {
    if (!onClarificationSubmit || !answers[subTaskId]) return
    setSubmitting(subTaskId)
    try {
      await onClarificationSubmit(subTaskId, answers[subTaskId])
      setAnswers((prev) => ({ ...prev, [subTaskId]: '' }))
    } finally {
      setSubmitting(null)
    }
  }

  const getStatusIcon = (status: SubTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'awaiting_user_input':
        return <AlertCircle className="h-5 w-5 text-orange-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'pending':
      default:
        return <CircleDashed className="h-5 w-5 text-slate-300" />
    }
  }

  const getStatusBadge = (status: SubTask['status']) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            Completed
          </Badge>
        )
      case 'processing':
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200">
            Processing
          </Badge>
        )
      case 'awaiting_user_input':
        return (
          <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600">
            Needs Input
          </Badge>
        )
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'pending':
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Execution Plan</CardTitle>
        <CardDescription>The orchestrator has broken down the task into the following steps.</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion
          type="multiple"
          defaultValue={subTasks
            .filter((t) => t.status === 'processing' || t.status === 'awaiting_user_input')
            .map((t) => t.id)}
          className="w-full"
        >
          {subTasks.map((task, index) => (
            <AccordionItem key={task.id} value={task.id}>
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3 w-full text-left">
                  {getStatusIcon(task.status)}
                  <div className="flex flex-col flex-grow">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        Step {index + 1}: {task.title}
                      </span>
                      {getStatusBadge(task.status)}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4 px-8 border-l-2 ml-2 border-slate-100">
                <p className="text-sm text-slate-600 mb-4">{task.description}</p>

                {task.status === 'awaiting_user_input' && (
                  <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-100">
                    <h4 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Agent needs your clarification to proceed
                    </h4>
                    <p className="text-sm text-orange-700 mb-4">
                      Please check the chat for the specific question and reply here.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Textarea
                        placeholder="Your answer..."
                        className="bg-white border-orange-200 focus-visible:ring-orange-500"
                        value={answers[task.id] || ''}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        className="self-end bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={() => handleAnswerSubmit(task.id)}
                        disabled={!answers[task.id] || submitting === task.id}
                      >
                        {submitting === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <PlayCircle className="h-4 w-4 mr-2" />
                        )}
                        Submit & Resume
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
