import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/vercel/api'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await getCurrentUser()
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ user: result.data })
}
