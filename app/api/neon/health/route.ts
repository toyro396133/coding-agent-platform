import { NextResponse } from 'next/server'
import { sql } from '@/lib/neon'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await sql`SELECT version()`
    const row = rows[0] as { version: string }
    return NextResponse.json({ status: 'connected', version: row.version })
  } catch (_error) {
    console.error('Neon health check failed')
    return NextResponse.json({ status: 'error', message: 'Neon health check failed' }, { status: 500 })
  }
}
