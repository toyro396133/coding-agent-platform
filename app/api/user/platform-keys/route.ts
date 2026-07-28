import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromReq } from '@/lib/session/server'
import { db } from '@/lib/db/client'
import { platformApiKeys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import crypto from 'crypto'

// Utility to create a secure API key
function generateSecureApiKey() {
  const bytes = crypto.randomBytes(32)
  return `sk-platform-${bytes.toString('hex')}`
}

// Utility to hash the key for storage (we never store the raw key)
function hashApiKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// Get all platform keys for a user
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keys = await db
      .select({
        id: platformApiKeys.id,
        name: platformApiKeys.name,
        hint: platformApiKeys.hint,
        createdAt: platformApiKeys.createdAt,
      })
      .from(platformApiKeys)
      .where(eq(platformApiKeys.userId, session.user.id))
      // Order by latest
      .orderBy(platformApiKeys.createdAt)

    return NextResponse.json({
      success: true,
      apiKeys: keys.reverse(), // latest first
    })
  } catch (error) {
    console.error('Error fetching platform API keys:', error)
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
  }
}

// Create a new platform key
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name } = body as { name: string }

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const rawKey = generateSecureApiKey()
    const hashedValue = hashApiKey(rawKey)
    const hint = `${rawKey.substring(0, 15)}...${rawKey.substring(rawKey.length - 4)}`

    const id = nanoid()
    await db.insert(platformApiKeys).values({
      id,
      userId: session.user.id,
      name: name.trim(),
      hashedValue,
      hint,
    })

    // Return the RAW key ONLY ONCE. The client must save it.
    return NextResponse.json({
      success: true,
      key: {
        id,
        name: name.trim(),
        value: rawKey,
        hint,
        createdAt: new Date(),
      },
    })
  } catch (error) {
    console.error('Error creating platform API key:', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }
}

// Delete a platform key
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 })
    }

    const result = await db
      .delete(platformApiKeys)
      .where(and(eq(platformApiKeys.id, id), eq(platformApiKeys.userId, session.user.id)))
      .returning()

    if (result.length === 0) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting platform API key:', error)
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }
}
