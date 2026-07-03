import { db } from '../db/client'
import { settings } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

export async function getSubAgentModel(subTaskType: string, userId: string): Promise<string> {
  const keyName = `routing:dynamic_${subTaskType}`

  // Try to find an existing configuration for this user
  const userSetting = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, keyName)))
    .limit(1)

  if (userSetting.length > 0) {
    return userSetting[0].value
  }

  // If not found, intelligently assign a fallback model based on the sub-agent type
  const typeLower = subTaskType.toLowerCase()
  let fallbackModel = 'gpt-4o-mini' // Default logic/terminal tasks

  if (
    typeLower.includes('doc') ||
    typeLower.includes('reader') ||
    typeLower.includes('parser') ||
    typeLower.includes('syntax')
  ) {
    fallbackModel = 'gemini-2.5-flash'
  } else if (
    typeLower.includes('patch') ||
    typeLower.includes('writer') ||
    typeLower.includes('code') ||
    typeLower.includes('ui')
  ) {
    fallbackModel = 'claude-3-5-haiku'
  }

  // Save the fallback to the database so it appears in the UI.
  // Use onConflictDoNothing to avoid a race with concurrent requests inserting
  // the same (userId, key) pair, which would otherwise violate the unique index.
  try {
    await db
      .insert(settings)
      .values({
        id: generateId(),
        userId,
        key: keyName,
        value: fallbackModel,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: [settings.userId, settings.key] })
  } catch (error) {
    console.error('Failed to save dynamic sub-agent routing to DB:', error)
  }

  return fallbackModel
}
