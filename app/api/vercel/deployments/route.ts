import { NextRequest, NextResponse } from 'next/server'
import { listDeployments } from '@/lib/vercel/api'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const result = await listDeployments(projectId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ deployments: result.data.deployments })
}
