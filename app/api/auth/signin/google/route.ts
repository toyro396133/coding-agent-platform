import { Google, generateCodeVerifier, generateState } from 'arctic'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'

export async function GET(req: NextRequest): Promise<Response> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback/google`

  if (!clientId || !clientSecret) {
    return Response.redirect(new URL('/?error=google_not_configured', req.url))
  }

  const google = new Google(clientId, clientSecret, redirectUri)

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email'])

  const store = await cookies()
  const redirectTo = isRelativeUrl(req.nextUrl.searchParams.get('next') ?? '/')
    ? (req.nextUrl.searchParams.get('next') ?? '/')
    : '/'

  for (const [key, value] of [
    [`google_auth_redirect_to`, redirectTo],
    [`google_auth_state`, state],
    [`google_auth_code_verifier`, codeVerifier],
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
