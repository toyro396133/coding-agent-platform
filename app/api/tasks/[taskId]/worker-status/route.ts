import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import type { WorkerTeamConfigData } from '@/lib/db/schema'
import { type LogEntry, tasks } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

// Helper: strip [WORKER:role] prefix from log messages
function stripLogPrefix(message: string): string {
  return message.replace(/^\[WORKER:[^\]]+\]\s*/, '')
}

interface RouteParams {
  params: Promise<{
    taskId: string
  }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    const [task] = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        workerTeamConfig: tasks.workerTeamConfig,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        sandboxId: tasks.sandboxId,
        logs: tasks.logs,
      })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Return worker sandbox status data
    if (!task.workerTeamConfig || !Array.isArray(task.workerTeamConfig.workers)) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No worker team configured for this task',
      })
    }

    const config = task.workerTeamConfig as WorkerTeamConfigData
    const taskStatus = task.status
    const startedAt = task.createdAt ? new Date(task.createdAt).getTime() : Date.now()

    // Parse log entries into per-worker log arrays
    const taskLogs = (task.logs || []) as LogEntry[]
    const workerLogsMap: Record<string, LogEntry[]> = {}
    for (const log of taskLogs) {
      const match = log.message.match(/^\[WORKER:([^\]]+)\]/)
      if (match) {
        const workerName = match[1].trim()
        if (!workerLogsMap[workerName]) workerLogsMap[workerName] = []
        workerLogsMap[workerName].push(log)
      }
    }

    // Build worker statuses based on task state
    const workers = config.workers.map((worker) => {
      // Determine status based on overall task status
      let status: 'pending' | 'creating' | 'running' | 'completed' | 'failed' | 'timeout'
      switch (taskStatus) {
        case 'processing':
          status = 'running'
          break
        case 'completed':
          status = 'completed'
          break
        case 'error':
          status = 'failed'
          break
        case 'stopped':
          status = 'timeout'
          break
        default:
          status = 'pending'
      }

      const workerName = worker.role || `${worker.agentType} worker`
      const workerLogs = workerLogsMap[workerName] || []
      const workerErrors = workerLogs.filter((l) => l.type === 'error').map((l) => stripLogPrefix(l.message))

      return {
        id: worker.id,
        role: workerName,
        agentType: worker.agentType,
        model: worker.model,
        status,
        durationMs: task.updatedAt ? new Date(task.updatedAt).getTime() - startedAt : undefined,
        startedAt,
        logs: workerLogs,
        error: workerErrors.length > 0 ? workerErrors.join('\n') : undefined,
      }
    })

    // Determine overall status
    let overallStatus: 'idle' | 'deploying' | 'running' | 'completed' | 'failed' | 'partial'
    if (taskStatus === 'completed') {
      overallStatus = 'completed'
    } else if (taskStatus === 'error') {
      overallStatus = 'failed'
    } else if (taskStatus === 'processing') {
      overallStatus = 'running'
    } else if (taskStatus === 'stopped') {
      overallStatus = 'failed'
    } else {
      overallStatus = 'idle'
    }

    return NextResponse.json({
      success: true,
      data: {
        workers,
        totalDurationMs: task.updatedAt ? new Date(task.updatedAt).getTime() - startedAt : undefined,
        overallStatus,
        workerLogs: workerLogsMap,
      },
    })
  } catch (error) {
    console.error('Error fetching worker status:', error)
    return NextResponse.json({ error: 'Failed to fetch worker status' }, { status: 500 })
  }
}
