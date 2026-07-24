import 'server-only'

import { NextResponse } from 'next/server'
import { getUserByUsername } from '@/lib/db/users'
import { saveSession } from '@/lib/session/create'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }

    const user = await getUserByUsername(username)
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const session = {
      created: Date.now(),
      authProvider: 'credentials' as const,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || undefined,
        name: user.name || user.username,
        avatar: user.avatarUrl || '',
      },
    }

    const response = NextResponse.json({ success: true })
    await saveSession(response, session)

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'An error occurred during sign in' }, { status: 500 })
  }
}
