import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookie } from '@/lib/session/server'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { db } from '@/lib/db/client'
import { taskPlans, tasks } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'

export async function GET(request: Request, { params }: { params: { taskId: string } }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = await getSessionFromCookie(sessionCookie)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { taskId } = params

  try {
    const plans = await db.select().from(taskPlans).where(eq(taskPlans.taskId, taskId)).orderBy(desc(taskPlans.version))

    return NextResponse.json(plans)
  } catch (error) {
    console.error('Error fetching plans:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
