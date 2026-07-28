import { NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { projectRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function PATCH(request: Request, { params }: { params: { owner: string; repo: string; ruleId: string } }) {
  const session = await getSessionFromReq(request as any)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { ruleId } = params
  const body = await request.json()

  try {
    const updatedRule = await db
      .update(projectRules)
      .set({ isApproved: body.isApproved })
      .where(and(eq(projectRules.id, ruleId), eq(projectRules.userId, session.user.id)))
      .returning()

    return NextResponse.json(updatedRule[0])
  } catch (error) {
    console.error('Error updating rule:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { owner: string; repo: string; ruleId: string } },
) {
  const session = await getSessionFromReq(request as any)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { ruleId } = params

  try {
    await db.delete(projectRules).where(and(eq(projectRules.id, ruleId), eq(projectRules.userId, session.user.id)))

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error deleting rule:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
