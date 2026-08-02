import 'server-only'

import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { getUserByUsername } from '@/lib/db/users'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        name: users.name,
        provider: users.provider,
        createdAt: users.createdAt,
        hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      })
      .from(users)
      .orderBy(users.createdAt)

    return NextResponse.json({ users: allUsers })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { username, password, email, name, userId } = body

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    if (userId) {
      // Update existing user's password
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)

      if (existing.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      await db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))

      return NextResponse.json({ success: true, userId })
    }

    // Create new user
    if (!username) {
      return NextResponse.json({ error: 'Username is required for new users' }, { status: 400 })
    }

    const existing = await getUserByUsername(username)
    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    const newUserId = nanoid()
    const now = new Date()

    await db.insert(users).values({
      id: newUserId,
      provider: 'credentials',
      externalId: username,
      accessToken: '',
      username,
      email: email || null,
      name: name || null,
      passwordHash,
      avatarUrl: '',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })

    return NextResponse.json({
      success: true,
      userId: newUserId,
      username,
    })
  } catch (error) {
    console.error('Failed to create user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
