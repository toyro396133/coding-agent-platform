import 'server-only'

import { and, eq, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { accounts, mergeTokens, users } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeCandidate {
  /** The existing user ID that the new account will be merged into */
  targetUserId: string
  /** The existing user's provider (for display) */
  targetProvider: string
  /** The existing user's email */
  matchedEmail: string
  /** The new provider being linked */
  newProvider: string
  /** The new provider's username */
  newUsername: string
  /** The merge token ID (for confirmation) */
  tokenId: string
  /** When the token expires */
  expiresAt: Date
}

export interface MergeResult {
  merged: boolean
  reason?: 'already_merged' | 'no_match' | 'token_expired' | 'merge_completed'
  tokenId?: string
  targetUserId?: string
}

// ---------------------------------------------------------------------------
// Find an existing user by verified email
// ---------------------------------------------------------------------------

/**
 * Look for an existing user that shares the same verified email with a
 * different OAuth provider. Returns the user if found, or null if no match.
 */
export async function findExistingUserByEmail(email: string): Promise<typeof users.$inferSelect | null> {
  if (!email) return null

  const normalizedEmail = email.toLowerCase().trim()

  const result = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, normalizedEmail),
        or(
          eq(users.provider, 'github'),
          eq(users.provider, 'google'),
          eq(users.provider, 'discord'),
          eq(users.provider, 'vercel'),
        ),
      ),
    )
    .limit(1)

  return result[0] || null
}

// ---------------------------------------------------------------------------
// Request a merge — create a one-time token
// ---------------------------------------------------------------------------

/**
 * Create a one-time merge token that the user must confirm before the accounts
 * are linked. This is called during the sign-in flow when a user signs in with
 * a new provider that shares a verified email with an existing account.
 *
 * Returns the MergeCandidate or null if the user already has an account with
 * the new provider.
 */
export async function requestMerge(
  newProvider: 'github' | 'google' | 'discord',
  externalUserId: string,
  _accessToken: string,
  encryptedAccessToken: string,
  encryptedRefreshToken: string | null | undefined,
  scope: string | null | undefined,
  username: string,
  email: string,
): Promise<MergeCandidate | null> {
  // Don't merge if the new provider already exists as a primary account or
  // linked account for this user — handled by the caller before calling this.
  const existingUser = await findExistingUserByEmail(email)
  if (!existingUser) {
    return null // No existing user to merge with
  }

  // Don't create a token if the user already has this provider linked
  const existingAccount = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, existingUser.id), eq(accounts.provider, newProvider)))
    .limit(1)

  if (existingAccount.length > 0) {
    return null // Already linked
  }

  // Don't create a token if the user is the same provider
  if (existingUser.provider === newProvider && existingUser.externalId === externalUserId) {
    return null // Same account
  }

  // Create a one-time merge token that expires in 24 hours
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const tokenId = nanoid()

  await db.insert(mergeTokens).values({
    id: tokenId,
    targetUserId: existingUser.id,
    provider: newProvider,
    externalUserId,
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken || null,
    scope: scope || null,
    username,
    matchedEmail: email.toLowerCase().trim(),
    status: 'pending',
    createdAt: now,
    expiresAt,
    confirmedAt: null,
  })

  return {
    targetUserId: existingUser.id,
    targetProvider: existingUser.provider,
    matchedEmail: email.toLowerCase().trim(),
    newProvider,
    newUsername: username,
    tokenId,
    expiresAt,
  }
}

// ---------------------------------------------------------------------------
// Confirm a merge — link the accounts
// ---------------------------------------------------------------------------

/**
 * Confirm a merge by token ID. Links the new provider account to the existing
 * user by inserting a row into the accounts table, then marks the token as
 * confirmed.
 */
export async function confirmMerge(tokenId: string): Promise<MergeResult> {
  const token = await db.select().from(mergeTokens).where(eq(mergeTokens.id, tokenId)).limit(1)

  if (token.length === 0) {
    return { merged: false, reason: 'no_match' }
  }

  const t = token[0]

  if (t.status !== 'pending') {
    return { merged: false, reason: t.status === 'expired' ? 'token_expired' : 'already_merged' }
  }

  if (new Date() > t.expiresAt) {
    // Token expired — mark as expired and return
    await db.update(mergeTokens).set({ status: 'expired' }).where(eq(mergeTokens.id, tokenId))
    return { merged: false, reason: 'token_expired' }
  }

  const now = new Date()

  // Insert the new provider as a linked account for the existing user
  await db.insert(accounts).values({
    id: nanoid(),
    userId: t.targetUserId,
    provider: t.provider,
    externalUserId: t.externalUserId,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    scope: t.scope,
    username: t.username,
    createdAt: now,
    updatedAt: now,
  })

  // Mark the token as confirmed
  await db.update(mergeTokens).set({ status: 'confirmed', confirmedAt: now }).where(eq(mergeTokens.id, tokenId))

  return {
    merged: true,
    reason: 'merge_completed',
    targetUserId: t.targetUserId,
  }
}

// ---------------------------------------------------------------------------
// Get pending merge for a user
// ---------------------------------------------------------------------------

/**
 * Get all pending merge tokens for a user (tokens that were created for
 * this user as the target of a merge request).
 */
export async function getPendingMerges(userId: string): Promise<MergeCandidate[]> {
  const tokens = await db
    .select()
    .from(mergeTokens)
    .where(and(eq(mergeTokens.targetUserId, userId), eq(mergeTokens.status, 'pending')))
    .orderBy(mergeTokens.createdAt)

  return tokens.map((t) => ({
    targetUserId: t.targetUserId,
    targetProvider: '', // filled in by caller if needed
    matchedEmail: t.matchedEmail,
    newProvider: t.provider,
    newUsername: t.username,
    tokenId: t.id,
    expiresAt: t.expiresAt,
  }))
}

// ---------------------------------------------------------------------------
// Reject / expire a merge token
// ---------------------------------------------------------------------------

/**
 * Expire a pending merge token (user declined the merge).
 */
export async function expireMergeToken(tokenId: string): Promise<void> {
  await db.update(mergeTokens).set({ status: 'expired' }).where(eq(mergeTokens.id, tokenId))
}
