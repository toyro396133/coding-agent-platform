import { NextResponse } from 'next/server'
import { stopDaemonAgent } from '@/lib/ai/orchestrator/worker/worker-manager'
import { getServerSession } from '@/lib/session/get-server-session'

export async function POST(_request: Request, { params }: { params: Promise<{ daemonId: string }> }) {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { daemonId } = await params
  const result = await stopDaemonAgent(daemonId)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
