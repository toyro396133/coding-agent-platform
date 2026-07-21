'use server'

import { db } from '../db/client'
import { backgroundTestsBank } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { revalidatePath } from 'next/cache'

export async function fetchBackgroundTests() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const tests = await db.select().from(backgroundTestsBank).orderBy(desc(backgroundTestsBank.createdAt)).limit(50)

  return tests
}

export async function toggleTestEnabled(id: string, isEnabled: boolean) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  await db.update(backgroundTestsBank).set({ isEnabled }).where(eq(backgroundTestsBank.id, id))

  revalidatePath('/tasks')
}
