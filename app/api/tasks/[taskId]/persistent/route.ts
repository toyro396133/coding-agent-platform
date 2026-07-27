import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { startPersistentAgent, stopPersistentAgent, getPersistentAgentStatus, listActivePersistentAgents } from '@/lib/ai/orchestrator/runtime/persistent-agent'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'start') {
      const agent = task[0].selectedAgent || 'claude'
      const model = task[0].selectedModel || ''
      const intervalMs = body.intervalMs || 60000
      const maxRuns = body.maxRuns || 10

      const started = startPersistentAgent({
        taskId,
        agent,
        model,
        intervalMs,
        maxRuns,
      })

      return NextResponse.json({ success: started, agent, model, intervalMs, maxRuns })
    }

    if (action === 'stop') {
      const stopped = stopPersistentAgent(taskId)
      return NextResponse.json({ success: stopped })
    }

    if (action === 'status') {
      const status = getPersistentAgentStatus(taskId)
      return NextResponse.json(status)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Persistent agent error:', error)
    return NextResponse.json({ error: 'Failed to manage persistent agent' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agents = listActivePersistentAgents()
    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Error listing persistent agents:', error)
    return NextResponse.json({ error: 'Failed to list' }, { status: 500 })
  }
}
