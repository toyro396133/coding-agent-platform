import 'server-only'

import ms from 'ms'
import { encrypt } from '@/lib/crypto'
import { requestMerge } from '@/lib/db/merge-identity'
import { getUserByEmail, getUserById, upsertUser } from '@/lib/db/users'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { fetchUser } from '@/lib/vercel-client/user'
import { SESSION_COOKIE_NAME } from './constants'
import type { Session, Tokens } from './types'

export async function createSession(tokens: Tokens): Promise<Session | undefined> {
  const user = await fetchUser(tokens.accessToken)

  if (!user) {
    console.log('Failed to fetch user')
    return undefined
  }

  // Create or update user in database
  const externalId = user.uid || user.id || ''
  const encryptedAccessToken = encrypt(tokens.accessToken)
  const encryptedRefreshToken = tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined

  const userId = await upsertUser({
    provider: 'vercel',
    externalId,
    accessToken: encryptedAccessToken, // Encrypt before storing
    refreshToken: encryptedRefreshToken, // Encrypt if present
    scope: undefined, // Vercel doesn't provide scope
    username: user.username,
    email: user.email,
    name: user.name,
    avatarUrl: `https://vercel.com/api/www/avatar/?u=${user.username}`,
  })

  // Cross-provider merge: if this user has a verified email that matches an
  // existing account, offer to link the accounts.
  // Note: Vercel doesn't create a row in the accounts table — it's a primary
  // provider. The merge token is created here so the user can confirm.
  if (user.email) {
    const existingUser = await getUserByEmail(user.email)
    if (existingUser && existingUser.id !== userId) {
      const mergeCandidate = await requestMerge(
        'github', // Vercel merges via GitHub connection; this is a placeholder
        externalId,
        tokens.accessToken,
        encryptedAccessToken,
        encryptedRefreshToken,
        undefined,
        user.username,
        user.email,
      )
      if (mergeCandidate) {
        console.log('Created merge token for Vercel session')
      }
    }
  }

  const dbUser = await getUserById(userId)

  const session = {
    created: Date.now(),
    authProvider: 'vercel' as const,
    user: {
      id: userId, // Internal user ID
      username: user.username,
      email: user.email,
      name: user.name,
      avatar: `https://vercel.com/api/www/avatar/?u=${user.username}`,
      locale: (dbUser?.locale as 'en' | 'he') || 'he',
    },
  }

  console.log('Created session')
  return session
}

const COOKIE_TTL = ms('1y')

export async function saveSession(res: Response, session: Session | undefined): Promise<string | undefined> {
  if (!session) {
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax`,
    )
    return
  }

  const value = await encryptJWE(session, '1y')
  const expires = new Date(Date.now() + COOKIE_TTL).toUTCString()
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_TTL / 1000}; Expires=${expires}; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax`,
  )
  return value
}
