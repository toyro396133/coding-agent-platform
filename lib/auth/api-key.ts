import { db } from '@/lib/db/client'
import { platformApiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

/**
 * Validates a Bearer token against platform API keys.
 * Expects token format: sk-platform-...
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
    console.error('Error validating platform API key:', error)
    return null
  }
}

/**
 * Extracts Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}
