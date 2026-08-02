import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getPersistentAgentStatus,
  listActivePersistentAgents,
  startPersistentAgent,
  stopPersistentAgent,
} from '@/lib/ai/orchestrator/runtime/persistent-agent'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

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

      // Validate and normalize intervalMs
      let intervalMs = body.intervalMs
      if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs <= 0) {
        intervalMs = 60000 // Default to 60 seconds
      }
      // Clamp to reasonable bounds: min 10 seconds, max 24 hours
      intervalMs = Math.max(10000, Math.min(intervalMs, 86400000))

      // Validate and normalize maxRuns
      let maxRuns = body.maxRuns
      if (typeof maxRuns !== 'number' || !Number.isFinite(maxRuns) || maxRuns <= 0 || !Number.isInteger(maxRuns)) {
        maxRuns = 10 // Default to 10 runs
      }
      // Clamp to reasonable bounds: min 1, max 1000
      maxRuns = Math.max(1, Math.min(Math.floor(maxRuns), 1000))

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
  } catch (_error) {
    console.error('Persistent agent operation failed')
    return NextResponse.json({ error: 'Failed to manage persistent agent' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all agents and filter by user's tasks
    const allAgents = listActivePersistentAgents()
    const userTaskIds = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))

    const userTaskIdSet = new Set(userTaskIds.map((t) => t.id))
    const userAgents = allAgents.filter((agent) => userTaskIdSet.has(agent.taskId))

    return NextResponse.json({ agents: userAgents })
  } catch (_error) {
    console.error('Persistent agent list failed')
    return NextResponse.json({ error: 'Failed to list' }, { status: 500 })
  }
}
