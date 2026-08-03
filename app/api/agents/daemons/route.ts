import { NextResponse } from 'next/server'
import { getDaemonAgentStatuses, stopDaemonAgent } from '@/lib/ai/orchestrator/worker/worker-manager'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daemons = getDaemonAgentStatuses()
  return NextResponse.json({ daemons })
}

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, daemonId } = body

    if (action === 'stop' && daemonId) {
      const result = await stopDaemonAgent(daemonId)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
