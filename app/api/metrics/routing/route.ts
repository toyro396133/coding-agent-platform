import { NextResponse } from 'next/server'
import { getRouterCache } from '@/lib/ai/router-cache'
import { getRouterMetrics } from '@/lib/ai/router-metrics'
import { getServerSession } from '@/lib/session/get-server-session'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const metrics = getRouterMetrics()
    const cache = getRouterCache()

    // snapshot() excludes internal fields (they live on the class, not the data)
    const snapshot = metrics.snapshot(cache.stats())

    return NextResponse.json(snapshot)
  } catch (error) {
    console.error('Error fetching router metrics:', error)
    return NextResponse.json({ error: 'Failed to fetch router metrics' }, { status: 500 })
  }
}
