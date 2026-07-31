import 'server-only'

import type { Session } from './types'
import { SESSION_COOKIE_NAME } from './constants'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { upsertUser, getUserById } from '@/lib/db/users'
import { encrypt } from '@/lib/crypto'
import ms from 'ms'

interface DiscordUser {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  email: string | null
  verified: boolean
}

export async function createDiscordSession(accessToken: string, refreshToken?: string): Promise<Session | undefined> {
  // Fetch Discord user info
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!userResponse.ok) {
    console.error('Failed to fetch Discord user')
    return undefined
  }

  const discordUser = (await userResponse.json()) as DiscordUser

  const email = discordUser.email || undefined
  const username = discordUser.username
  const name = discordUser.global_name || discordUser.username
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : undefined

  // Create or update user in database
  const userId = await upsertUser({
    provider: 'discord',
    externalId: discordUser.id, // Discord snowflake ID
    accessToken: encrypt(accessToken), // Encrypt before storing
    refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
    scope: 'identify email',
    username,
    email,
    name,
    avatarUrl,
  })

  const dbUser = await getUserById(userId)

  const session: Session = {
    created: Date.now(),
    authProvider: 'discord',
    user: {
      id: userId, // Internal user ID
      username,
      email,
      name,
      avatar: avatarUrl || '',
      locale: (dbUser?.locale as 'en' | 'he') || 'he',
    },
  }

  console.log('Created Discord session')
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
