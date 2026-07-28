import { db } from '@/lib/db/client'
import { platformApiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

/**
 * Validates a platform API key and identifies its associated user.
 *
 * @param token - The platform API key to validate.
 * @returns The associated user ID if the key is valid, `null` otherwise.
 */
export async function validatePlatformApiKey(token: string): Promise<string | null> {
  try {
    if (!token.startsWith('sk-platform-')) {
      return null
    }

    // Hash the incoming key to compare with the DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    const result = await db
      .select({ userId: platformApiKeys.userId })
      .from(platformApiKeys)
      .where(eq(platformApiKeys.hashedValue, hashedToken))
      .limit(1)

    if (result.length > 0) {
      return result[0].userId
    }

    return null
  } catch (error) {
    console.error('Error validating platform API key')
    return null
  }
}

/**
 * Extracts a bearer token from an HTTP Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns The token following the `Bearer ` prefix, or `null` if the header is missing or uses a different format.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}
