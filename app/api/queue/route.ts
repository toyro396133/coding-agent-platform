import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/session/get-server-session'
import {
  enqueueRequest,
  listQueue,
  updateQueueRequest,
  reorderQueueRequest,
  deleteQueueRequest,
  mergeQueueRequests,
} from '@/lib/queue/engine'
import { advanceAndDispatchQueue } from '@/lib/queue/dispatch'

/**
 * /api/queue — REST API for the user request queue.
 *
 * GET    → list the user's queue (ordered by position)
 * POST   → enqueue a new request (+ optional auto-advance)
 * PATCH  → update a request or reorder it ({ position })
 * DELETE → soft-delete one or more requests (or merge)
 *
 * All operations are scoped to the authenticated session user.
 */

const enqueueSchema = z.object({
  prompt: z.string().min(1),
  title: z.string().optional().nullable(),
  repoUrl: z.string().url().optional().nullable(),
  selectedAgent: z.string().optional(),
  selectedModel: z.string().optional().nullable(),
  installDependencies: z.boolean().optional(),
  keepAlive: z.boolean().optional(),
  enableBrowser: z.boolean().optional(),
  maxDuration: z.number().optional().nullable(),
  /** When true (default), immediately advances the queue if nothing is running */
  autoAdvance: z.boolean().optional().default(true),
})

const updateSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).optional(),
  title: z.string().optional().nullable(),
  repoUrl: z.string().url().optional().nullable(),
  selectedAgent: z.string().optional(),
  selectedModel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  /** If provided, reorders the item to this 0-based position */
  position: z.number().int().min(0).optional(),
})

const mergeSchema = z.object({
  targetId: z.string().min(1),
  mergeIds: z.array(z.string().min(1)).min(1),
})

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const queue = await listQueue(session.user.id)
    return NextResponse.json({ queue })
  } catch (error) {
    console.error('Error fetching queue:', error)
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const parsed = enqueueSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
    }

    const { autoAdvance, ...input } = parsed.data
    // Client-sourced requests are always labeled `user` — the `agent` label is
    // reserved for follow-up steps added by the orchestrator (engine path).
    const item = await enqueueRequest({ userId: session.user.id, ...input, source: 'user' })

    // Auto-advance: if nothing is currently running, claim the next queued
    // request and dispatch its background run through the internal tasks
    // pipeline. The session cookie is forwarded so the tasks route can
    // authenticate the same user. Runs in after() to keep the response fast.
    if (autoAdvance) {
      const cookieHeader = req.headers.get('cookie')
      after(async () => {
        try {
          await advanceAndDispatchQueue(session.user.id, cookieHeader)
        } catch (error) {
          console.error('Queue auto-advance failed')
        }
      })
    }

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    console.error('Error enqueueing request:', error)
    return NextResponse.json({ error: 'Failed to enqueue request' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
    }

    const { id, position, ...updates } = parsed.data

    if (position !== undefined) {
      const queue = await reorderQueueRequest(session.user.id, id, position)
      return NextResponse.json({ queue })
    }
    const item = await updateQueueRequest(session.user.id, id, updates)
    if (!item) return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Error updating queue item:', error)
    return NextResponse.json({ error: 'Failed to update queue item' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // Merge: ?action=merge with a JSON body
    if (action === 'merge') {
      const body = await req.json().catch(() => null)
      if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

      const parsed = mergeSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid merge request', details: parsed.error.flatten() }, { status: 400 })
      }

      const merged = await mergeQueueRequests(session.user.id, parsed.data.targetId, parsed.data.mergeIds)
      if (!merged) return NextResponse.json({ error: 'Target queue item not found' }, { status: 404 })

      return NextResponse.json({ item: merged })
    }

    // Default: delete by id
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })

    const deleted = await deleteQueueRequest(session.user.id, id)
    if (!deleted) return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('Error deleting queue item:', error)
    return NextResponse.json({ error: 'Failed to delete queue item' }, { status: 500 })
  }
}
