import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { createRoom, joinRoom, leaveRoom, addMessage, getRoom, getRoomUserCount } from '@/lib/collaboration/room-manager'

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

    if (action === 'join') {
      createRoom(taskId)
      const room = joinRoom(taskId, {
        id: session.user.id,
        name: body.userName || session.user.name || session.user.username || 'Anonymous',
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
      const msg = addMessage(taskId, {
        userId: session.user.id,
        userName: body.userName || session.user.name || session.user.username || 'Anonymous',
        text: body.text || '',
      })
      if (!msg) {
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
      }
      return NextResponse.json({ success: true, message: msg })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Collaboration error:', error)
    return NextResponse.json({ error: 'Failed to process collaboration action' }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const data = getRoom(taskId)
    if (!data) {
      return NextResponse.json({ exists: false, users: [], messages: [] })
    }

    return NextResponse.json({ exists: true, ...data })
  } catch (error) {
    console.error('Error fetching room:', error)
    return NextResponse.json({ error: 'Failed to fetch room' }, { status: 500 })
  }
}
