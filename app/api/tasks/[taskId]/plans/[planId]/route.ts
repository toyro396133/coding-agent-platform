import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookie } from '@/lib/session/server'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { db } from '@/lib/db/client'
import { taskPlans, tasks, taskMessages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string; planId: string }> }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = await getSessionFromCookie(sessionCookie)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { taskId, planId } = await context.params
  const { action, feedback } = await request.json()

  if (!['approve', 'reject'].includes(action)) {
    return new NextResponse('Invalid action', { status: 400 })
  }

  try {
    // Validate ownership and plan-task relationship
    const planWithTask = await db
      .select({
        planId: taskPlans.id,
        taskId: taskPlans.taskId,
        userId: tasks.userId,
      })
      .from(taskPlans)
      .innerJoin(tasks, eq(taskPlans.taskId, tasks.id))
      .where(and(eq(taskPlans.id, planId), eq(taskPlans.taskId, taskId)))
      .limit(1)

    if (!planWithTask || planWithTask.length === 0 || planWithTask[0].userId !== session.user.id) {
      return new NextResponse('Plan not found', { status: 404 })
    }

    const status = action === 'approve' ? 'approved' : 'rejected'

    await db
      .update(taskPlans)
      .set({
        status,
        approvedAt: action === 'approve' ? new Date() : null,
      })
      .where(eq(taskPlans.id, planId))

    if (action === 'approve') {
      await db.update(tasks).set({ status: 'processing' }).where(eq(tasks.id, taskId))

      await db.insert(taskMessages).values({
        id: nanoid(),
        taskId,
        role: 'user',
        content: 'I have approved the plan. Please proceed with the execution.',
      })
    } else {
      await db.update(tasks).set({ status: 'processing' }).where(eq(tasks.id, taskId))

      await db.insert(taskMessages).values({
        id: nanoid(),
        taskId,
        role: 'user',
        content: `I have rejected the plan. Please revise based on this feedback:\n\n${feedback}`,
      })
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('Error updating plan')
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
