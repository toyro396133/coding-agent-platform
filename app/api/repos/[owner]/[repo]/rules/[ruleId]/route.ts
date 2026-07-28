import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { projectRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { normalizeRepoUrl } from '@/lib/utils/repo-url'

export async function PATCH(request: NextRequest, context: { params: Promise<{ owner: string; repo: string; ruleId: string }> }) {
  const session = await getSessionFromReq(request)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { owner, repo, ruleId } = await context.params
  const repoUrl = normalizeRepoUrl(`https://github.com/${owner}/${repo}`)

  let body: any
  try {
    body = await request.json()
  } catch (error) {
    return new NextResponse('Invalid JSON body', { status: 400 })
  }

  if (typeof body.isApproved !== 'boolean') {
    return new NextResponse('Invalid isApproved value', { status: 400 })
  }

  try {
    const updatedRule = await db
      .update(projectRules)
      .set({ isApproved: body.isApproved })
      .where(and(
        eq(projectRules.id, ruleId),
        eq(projectRules.userId, session.user.id),
        eq(projectRules.repoUrl, repoUrl)
      ))
      .returning()

    if (!updatedRule || updatedRule.length === 0) {
      return new NextResponse('Rule not found', { status: 404 })
    }

    return NextResponse.json(updatedRule[0])
  } catch (error) {
    console.error('Error updating rule:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ owner: string; repo: string; ruleId: string }> },
) {
  const session = await getSessionFromReq(request)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { ruleId } = await context.params

  try {
    await db.delete(projectRules).where(and(eq(projectRules.id, ruleId), eq(projectRules.userId, session.user.id)))

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error deleting rule:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
