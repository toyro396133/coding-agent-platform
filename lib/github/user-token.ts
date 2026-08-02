import 'server-only'

import { db } from '@/lib/db/client'
import { users, accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSessionFromReq } from '@/lib/session/server'
import { decrypt } from '@/lib/crypto'
import type { NextRequest } from 'next/server'

/**
 * Get the GitHub access token for a user by their internal user ID.
 * Used by the external agent API (platform API key auth) where no browser
 * session cookie is available.
 *
 * Checks:
 * 1. Connected GitHub account (accounts table)
 * 2. Primary GitHub account (users table if they signed in with GitHub)
 */
export async function getUserGitHubTokenByUserId(userId: string): Promise<string | null> {
  try {
    const account = await db
      .select({ accessToken: accounts.accessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
      .limit(1)

    if (account[0]?.accessToken) {
      return decrypt(account[0].accessToken)
    }

    const user = await db
      .select({ accessToken: users.accessToken })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.provider, 'github')))
      .limit(1)

    if (user[0]?.accessToken) {
      return decrypt(user[0].accessToken)
    }

    return null
  } catch (error) {
    console.error('Error fetching user GitHub token')
    return null
  }
}

/**
 * Get the GitHub access token for the currently authenticated user
 * Returns null if user is not authenticated or hasn't connected GitHub
 *
 * Resolves the user ID from the session then delegates to the by-ID lookup.
 *
 * @param req - Optional NextRequest for API routes
 */
export async function getUserGitHubToken(req?: NextRequest): Promise<string | null> {
  // Get session from request if provided, otherwise use server session
  const session = req ? await getSessionFromReq(req) : await getServerSession()

  if (!session?.user?.id) {
    return null
  }

  return getUserGitHubTokenByUserId(session.user.id)
}
