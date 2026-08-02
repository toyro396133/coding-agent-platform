import { Discord } from 'arctic'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { createDiscordSession, saveSession } from '@/lib/session/create-discord'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()

  const storedState = cookieStore.get(`discord_auth_state`)?.value ?? null
  const storedCodeVerifier = cookieStore.get(`discord_auth_code_verifier`)?.value ?? null
  const storedRedirectTo = cookieStore.get(`discord_auth_redirect_to`)?.value ?? null

  if (
    code === null ||
    state === null ||
    storedState !== state ||
    storedRedirectTo === null ||
    storedCodeVerifier === null
  ) {
    return new Response('Invalid OAuth state', {
      status: 400,
    })
  }

  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response('Discord OAuth not configured', {
      status: 500,
    })
  }

  try {
    const discord = new Discord(clientId, clientSecret, `${req.nextUrl.origin}/api/auth/callback/discord`)
    const tokens = await discord.validateAuthorizationCode(code, storedCodeVerifier)

    const session = await createDiscordSession(
      tokens.accessToken(),
      tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
    )

    if (!session) {
      console.error('[Discord Callback] Failed to create session')
      return new Response('Failed to create session', { status: 500 })
    }

    // Create response with redirect
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: storedRedirectTo,
      },
    })

    // Save session to cookie
    await saveSession(response, session)

    // Clean up cookies
    cookieStore.delete(`discord_auth_state`)
    cookieStore.delete(`discord_auth_code_verifier`)
    cookieStore.delete(`discord_auth_redirect_to`)

    return response
  } catch (error) {
    console.error('[Discord Callback] OAuth callback error:', error)
    return new Response('Failed to complete Discord authentication', { status: 500 })
  }
}
