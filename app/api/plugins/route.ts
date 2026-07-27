import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { listRegisteredPacks, registerPack, unregisterPack } from '@/lib/ai/orchestrator/runtime/plugin-registry'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const packs = listRegisteredPacks()
    return NextResponse.json({ plugins: packs })
  } catch (error) {
    console.error('Error listing plugins:', error)
    return NextResponse.json({ error: 'Failed to list plugins' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, source } = body

    if (!name || !source) {
      return NextResponse.json({ error: 'Name and source are required' }, { status: 400 })
    }

    registerPack(name, (_ctx) => ({}), source)
    return NextResponse.json({ success: true, name, source })
  } catch (error) {
    console.error('Error registering plugin:', error)
    return NextResponse.json({ error: 'Failed to register plugin' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json({ error: 'Plugin name is required' }, { status: 400 })
    }

    const result = unregisterPack(name)
    return NextResponse.json({ success: result })
  } catch (error) {
    console.error('Error unregistering plugin:', error)
    return NextResponse.json({ error: 'Failed to unregister plugin' }, { status: 500 })
  }
}
