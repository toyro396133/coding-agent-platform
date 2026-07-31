import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { Google } from 'arctic'
import { createGoogleSession, saveSession } from '@/lib/session/create-google'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()

  const storedState = cookieStore.get(`google_auth_state`)?.value ?? null
  const storedCodeVerifier = cookieStore.get(`google_auth_code_verifier`)?.value ?? null
  const storedRedirectTo = cookieStore.get(`google_auth_redirect_to`)?.value ?? null

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

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response('Google OAuth not configured', {
      status: 500,
    })
  }

  try {
    const google = new Google(clientId, clientSecret, `${req.nextUrl.origin}/api/auth/callback/google`)
    const tokens = await google.validateAuthorizationCode(code, storedCodeVerifier)

    const session = await createGoogleSession(
      tokens.accessToken(),
      tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
    )

    if (!session) {
      console.error('[Google Callback] Failed to create session')
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
    cookieStore.delete(`google_auth_state`)
    cookieStore.delete(`google_auth_code_verifier`)
    cookieStore.delete(`google_auth_redirect_to`)

    return response
  } catch (error) {
    console.error('[Google Callback] OAuth callback error:', error)
    return new Response('Failed to complete Google authentication', { status: 500 })
  }
}
