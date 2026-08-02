import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { addMessage, createRoom, getRoom, joinRoom, leaveRoom } from '@/lib/collaboration/room-manager'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action } = body

    // Validate action
    const validActions = ['join', 'leave', 'message']
    if (!action || !validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Derive participant name from session
    const participantName = session.user.name || session.user.username || 'Anonymous'

    if (action === 'join') {
      createRoom(taskId)
      const room = joinRoom(taskId, {
        id: session.user.id,
        name: participantName,
      })
      if (!room) {
        return NextResponse.json({ error: 'Failed to join room' }, { status: 500 })
      }
      return NextResponse.json({ success: true, userCount: room.users.size })
    }

    if (action === 'leave') {
      const left = leaveRoom(taskId, session.user.id)
      return NextResponse.json({ success: left })
    }

    if (action === 'message') {
      // Validate message payload
      const text = body.text
      if (typeof text !== 'string' || !text.trim()) {
        return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
      }
      if (text.length > 5000) {
        return NextResponse.json({ error: 'Message too long' }, { status: 400 })
      }

      const msg = addMessage(taskId, {
        userId: session.user.id,
        userName: participantName,
        text: text,
      })
      if (!msg) {
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
      }
      return NextResponse.json({ success: true, message: msg })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (_error) {
    console.error('Collaboration operation failed')
    return NextResponse.json({ error: 'Failed to process collaboration action' }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Check task ownership before exposing room data
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const data = getRoom(taskId)
    if (!data) {
      return NextResponse.json({ exists: false, users: [], messages: [] })
    }

    return NextResponse.json({ exists: true, ...data })
  } catch (_error) {
    console.error('Room fetch failed')
    return NextResponse.json({ error: 'Failed to fetch room' }, { status: 500 })
  }
}
