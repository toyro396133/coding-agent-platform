import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { updateUserLocale } from '@/lib/db/users'

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
  return NextResponse.json({ success: true })
}
