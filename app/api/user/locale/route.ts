import ms from 'ms'
import { type NextRequest, NextResponse } from 'next/server'
import { updateUserLocale } from '@/lib/db/users'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { getServerSession } from '@/lib/session/get-server-session'
import { getSessionFromCookie } from '@/lib/session/server'

export async function PATCH(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { locale } = await request.json()
  if (locale !== 'en' && locale !== 'he') {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  await updateUserLocale(session.user.id, locale)

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (cookieValue) {
    const currentSession = await getSessionFromCookie(cookieValue)
    if (currentSession) {
      currentSession.user.locale = locale
      const encrypted = await encryptJWE(currentSession, '1y')
      const expires = new Date(Date.now() + ms('1y')).toUTCString()
      const response = NextResponse.json({ success: true })
      response.headers.append(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${encrypted}; Path=/; Max-Age=${ms('1y') / 1000}; Expires=${expires}; HttpOnly; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}SameSite=Lax`,
      )
      return response
    }
  }

  return NextResponse.json({ success: true })
}
