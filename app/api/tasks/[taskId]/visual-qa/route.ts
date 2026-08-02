import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks, visualQaRuns } from '@/lib/db/schema'
import { eq, and, desc, isNull } from 'drizzle-orm'

/**
 * GET /api/tasks/[taskId]/visual-qa
 *
 * Returns the visual QA run history (screenshots, verdicts, critiques) for a
 * task, newest first. The task must belong to the authenticated user.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await context.params

    // Verify the task belongs to the user
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task.length) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Fetch visual QA runs, newest first (cap payload — screenshots are large)
    const runs = await db
      .select()
      .from(visualQaRuns)
      .where(eq(visualQaRuns.taskId, taskId))
      .orderBy(desc(visualQaRuns.createdAt))
      .limit(50)

    return NextResponse.json({
      success: true,
      runs,
    })
  } catch (error) {
    console.error('Error fetching visual QA runs')
    return NextResponse.json({ error: 'Failed to fetch visual QA runs' }, { status: 500 })
  }
}
