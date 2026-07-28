import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import {
  listRegisteredPacks,
  registerPack,
  unregisterPack,
  listExternalPlugins,
} from '@/lib/ai/orchestrator/runtime/plugin-registry'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const packs = listRegisteredPacks()
    const externalPlugins = listExternalPlugins()

    return NextResponse.json({
      plugins: packs,
      externalPlugins: externalPlugins.map((p) => ({
        name: p.manifest.name,
        enabled: p.enabled,
        manifest: p.manifest,
      })),
    })
  } catch (error) {
    console.error('Failed to list plugins')
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
    const { name } = body

    if (!name) {
      return NextResponse.json({ error: 'Plugin name is required' }, { status: 400 })
    }

    // Register with active state, using server-determined source only
    registerPack(name, (_ctx) => ({}), 'external')
    return NextResponse.json({ success: true, name })
  } catch (error) {
    console.error('Failed to register plugin')
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
    console.error('Failed to unregister plugin')
    return NextResponse.json({ error: 'Failed to unregister plugin' }, { status: 500 })
  }
}
