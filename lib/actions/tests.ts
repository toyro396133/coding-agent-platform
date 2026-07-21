'use server'

import { db } from '../db/client'
import { backgroundTestsBank, backgroundTestExecutions } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { revalidatePath } from 'next/cache'

/**
 * Fetches the 50 most recently created background tests.
 *
 * @returns The background test records, ordered by creation time descending.
 * @throws If the user is not authenticated.
 */
export async function fetchBackgroundTests() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const tests = await db.select().from(backgroundTestsBank).orderBy(desc(backgroundTestsBank.createdAt)).limit(50)

  return tests
}

/**
 * Enables or disables a background test and refreshes the tasks route.
 *
 * @param id - The identifier of the background test to update
 * @param isEnabled - Whether the background test should be enabled
 */
export async function toggleTestEnabled(id: string, isEnabled: boolean) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  await db.update(backgroundTestsBank).set({ isEnabled }).where(eq(backgroundTestsBank.id, id))

  revalidatePath('/tasks')
}

export async function fetchBackgroundTestExecutionsByTaskId(taskId: string) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const executions = await db
    .select()
    .from(backgroundTestExecutions)
    .where(eq(backgroundTestExecutions.taskId, taskId))
    .orderBy(desc(backgroundTestExecutions.createdAt))
    .limit(50)

  return executions
}
