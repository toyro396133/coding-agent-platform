import { NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { projectRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(request: Request, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSessionFromReq(request as any)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { owner, repo } = params
  const repoUrl = `https://github.com/${owner}/${repo}`

  try {
    const rules = await db
      .select()
      .from(projectRules)
      .where(and(eq(projectRules.userId, session.user.id), eq(projectRules.repoUrl, repoUrl)))

    return NextResponse.json(rules)
  } catch (error) {
    console.error('Error fetching rules:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: { owner: string; repo: string } }) {
  const session = await getSessionFromReq(request as any)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { owner, repo } = params
  const repoUrl = `https://github.com/${owner}/${repo}`
  const body = await request.json()
  const { ruleContent } = body

  if (!ruleContent) {
    return new NextResponse('Missing ruleContent', { status: 400 })
  }

  try {
    const newRule = await db
      .insert(projectRules)
      .values({
        userId: session.user.id,
        repoUrl,
        ruleContent,
        isApproved: true, // Manually added rules are approved by default
      })
      .returning()

    return NextResponse.json(newRule[0])
  } catch (error) {
    console.error('Error adding rule:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
