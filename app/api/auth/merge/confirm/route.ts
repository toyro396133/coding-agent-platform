import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getServerSession } from '@/lib/session/get-server-session'
import { confirmMerge } from '@/lib/db/merge-identity'
import { mergeTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  tokenId: z.string().min(1, 'Token ID is required'),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  // Verify that the authenticated user owns this merge token
  const token = await db
    .select({ targetUserId: mergeTokens.targetUserId })
    .from(mergeTokens)
    .where(eq(mergeTokens.id, parsed.data.tokenId))
    .limit(1)

  if (token.length === 0) {
    return NextResponse.json({ error: 'Merge token not found' }, { status: 404 })
  }

  if (token[0].targetUserId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await confirmMerge(parsed.data.tokenId)

  if (!result.merged) {
    const status = result.reason === 'token_expired' ? 410 : 400
    return NextResponse.json({ error: `Merge failed: ${result.reason}` }, { status })
  }

  return NextResponse.json({ merged: true, targetUserId: result.targetUserId })
}
