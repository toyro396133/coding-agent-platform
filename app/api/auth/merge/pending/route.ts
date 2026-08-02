import { NextResponse } from 'next/server'
import { getPendingMerges } from '@/lib/db/merge-identity'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const merges = await getPendingMerges(session.user.id)
  return NextResponse.json({ merges })
}
