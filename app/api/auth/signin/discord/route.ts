import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { Discord, generateCodeVerifier, generateState } from 'arctic'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'

export async function GET(req: NextRequest): Promise<Response> {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback/discord`

  if (!clientId || !clientSecret) {
    return Response.redirect(new URL('/?error=discord_not_configured', req.url))
  }

  const discord = new Discord(clientId, clientSecret, redirectUri)

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = discord.createAuthorizationURL(state, codeVerifier, ['identify', 'email'])

  const store = await cookies()
  const redirectTo = isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/')
    ? (req.nextUrl.searchParams.get('next') ?? '/')
    : '/'

  for (const [key, value] of [
    [`discord_auth_redirect_to`, redirectTo],
    [`discord_auth_state`, state],
    [`discord_auth_code_verifier`, codeVerifier],
  ]) {
    store.set(key, value, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10, // 10 minutes
      sameSite: 'lax',
    })
  }

  return Response.redirect(url)
}
