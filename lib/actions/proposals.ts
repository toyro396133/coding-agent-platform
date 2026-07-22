'use server'

import { db } from '../db/client'
import { proposalsBank } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { revalidatePath } from 'next/cache'

/**
 * Retrieves the most recent proposals for the authenticated user.
 *
 * @returns The latest 50 proposals, ordered by creation time
 * @throws Error when no authenticated user is available
 */
export async function fetchProposals() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const proposals = await db.select().from(proposalsBank).orderBy(desc(proposalsBank.createdAt)).limit(50)

  return proposals
}

/**
 * Updates a proposal's status and refreshes the tasks route.
 *
 * @param id - The proposal identifier
 * @param status - The new proposal status
 */
export async function updateProposalStatus(id: string, status: 'accepted' | 'rejected') {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  await db.update(proposalsBank).set({ status }).where(eq(proposalsBank.id, id))

  revalidatePath('/tasks')
}
