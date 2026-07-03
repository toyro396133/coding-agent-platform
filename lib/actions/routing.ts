'use server'

import { db } from '../db/client'
import { settings } from '../db/schema'
import { eq, and, like } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { generateId } from 'ai'
import { revalidatePath } from 'next/cache'

export async function getDynamicRoutes() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return []
  }

  const userSettings = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, session.user.id), like(settings.key, 'routing:dynamic_%')))

  return userSettings.map((setting) => ({
    id: setting.id,
    subTaskType: setting.key.replace('routing:dynamic_', ''),
    model: setting.value,
  }))
}

export async function updateDynamicRoute(subTaskType: string, modelName: string) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const keyName = `routing:dynamic_${subTaskType}`

  const existing = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, session.user.id), eq(settings.key, keyName)))
    .limit(1)

  if (existing.length > 0) {
    await db.update(settings).set({ value: modelName, updatedAt: new Date() }).where(eq(settings.id, existing[0].id))
  } else {
    await db.insert(settings).values({
      id: generateId(),
      userId: session.user.id,
      key: keyName,
      value: modelName,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  revalidatePath('/settings')
}
