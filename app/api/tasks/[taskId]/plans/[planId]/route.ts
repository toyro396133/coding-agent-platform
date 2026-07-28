import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookie } from '@/lib/session/server'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { db } from '@/lib/db/client'
import { taskPlans, tasks, taskMessages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function PATCH(request: Request, { params }: { params: { taskId: string; planId: string } }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = await getSessionFromCookie(sessionCookie)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { taskId, planId } = params
  const { action, feedback } = await request.json()

  if (!['approve', 'reject'].includes(action)) {
    return new NextResponse('Invalid action', { status: 400 })
  }

  try {
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
    console.error('Error updating plan:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
