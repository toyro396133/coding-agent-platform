import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { listProjects } from '@/lib/vercel/api'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await listProjects()
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ projects: result.data.projects })
}
