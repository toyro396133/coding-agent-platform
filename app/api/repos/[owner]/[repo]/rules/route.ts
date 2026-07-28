import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { projectRules } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { normalizeRepoUrl } from '@/lib/utils/repo-url'

export async function GET(request: NextRequest, context: { params: Promise<{ owner: string; repo: string }> }) {
  const session = await getSessionFromReq(request)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { owner, repo } = await context.params
  const repoUrl = normalizeRepoUrl(`https://github.com/${owner}/${repo}`)

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

export async function POST(request: NextRequest, context: { params: Promise<{ owner: string; repo: string }> }) {
  const session = await getSessionFromReq(request)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { owner, repo } = await context.params
  const repoUrl = normalizeRepoUrl(`https://github.com/${owner}/${repo}`)

  let body: any
  try {
    body = await request.json()
  } catch (error) {
    return new NextResponse('Invalid JSON body', { status: 400 })
  }

  const { ruleContent } = body

  if (!ruleContent || typeof ruleContent !== 'string') {
    return new NextResponse('Missing or invalid ruleContent', { status: 400 })
  }

  const trimmedContent = ruleContent.trim()
  if (trimmedContent.length === 0) {
    return new NextResponse('Rule content cannot be empty', { status: 400 })
  }

  if (trimmedContent.length > 2000) {
    return new NextResponse('Rule content exceeds maximum length of 2000 characters', { status: 400 })
  }

  try {
    const newRule = await db
      .insert(projectRules)
      .values({
        userId: session.user.id,
        repoUrl,
        ruleContent: trimmedContent,
        isApproved: true, // Manually added rules are approved by default
      })
      .returning()

    return NextResponse.json(newRule[0])
  } catch (error) {
    console.error('Error adding rule:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
