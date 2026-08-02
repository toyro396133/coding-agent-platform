import 'server-only'

import ms from 'ms'
import { encrypt } from '@/lib/crypto'
import { getUserById, upsertUser } from '@/lib/db/users'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { SESSION_COOKIE_NAME } from './constants'
import type { Session } from './types'

interface GoogleUser {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
}

export async function createGoogleSession(accessToken: string, refreshToken?: string): Promise<Session | undefined> {
  // Fetch Google user info from the OpenID Connect userinfo endpoint
  const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!userResponse.ok) {
    console.error('Failed to fetch Google user')
    return undefined
  }

  const googleUser = (await userResponse.json()) as GoogleUser

  const email = googleUser.email || undefined
  const username = email?.split('@')[0] || `user_${googleUser.sub.slice(0, 8)}`
  const name = googleUser.name || username

  // Create or update user in database
  const userId = await upsertUser({
    provider: 'google',
    externalId: googleUser.sub, // Google numeric subject ID
    accessToken: encrypt(accessToken), // Encrypt before storing
    refreshToken: refreshToken ? encrypt(refreshToken) : undefined, // Google access tokens are short-lived; refresh keeps the account usable
    scope: 'openid profile email',
    username,
    email,
    name,
    avatarUrl: googleUser.picture || undefined,
  })

  const dbUser = await getUserById(userId)

  const session: Session = {
    created: Date.now(),
    authProvider: 'google',
    user: {
      id: userId, // Internal user ID
      username,
      email,
      name,
      avatar: googleUser.picture || '',
      locale: (dbUser?.locale as 'en' | 'he') || 'he',
    },
  }

  console.log('Created Google session')
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
