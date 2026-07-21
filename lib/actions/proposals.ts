'use server'

import { db } from '../db/client'
import { proposalsBank } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { getServerSession } from '../session/get-server-session'
import { revalidatePath } from 'next/cache'

export async function fetchProposals() {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  const proposals = await db.select().from(proposalsBank).orderBy(desc(proposalsBank.createdAt)).limit(50)

  return proposals
}

export async function updateProposalStatus(id: string, status: 'accepted' | 'rejected') {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }

  await db.update(proposalsBank).set({ status }).where(eq(proposalsBank.id, id))

  revalidatePath('/tasks')
}
