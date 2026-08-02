import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { type NextRequest, NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'
import { db } from '@/lib/db/client'
import { connectors } from '@/lib/db/schema'
import { getMarketplaceEntry } from '@/lib/mcp/marketplace'
import { getServerSession } from '@/lib/session/get-server-session'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { marketplaceId } = body

    if (!marketplaceId || typeof marketplaceId !== 'string') {
      return NextResponse.json({ success: false, error: 'marketplaceId is required' }, { status: 400 })
    }

    // Look up the marketplace entry
    const entry = getMarketplaceEntry(marketplaceId)
    if (!entry) {
      return NextResponse.json(
        { success: false, error: `Marketplace entry "${marketplaceId}" not found` },
        { status: 404 },
      )
    }

    // Check if user already has a connector with this name
    const existingConnector = await db
      .select({ id: connectors.id })
      .from(connectors)
      .where(and(eq(connectors.userId, session.user.id), eq(connectors.name, entry.name)))
      .limit(1)

    if (existingConnector.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `"${entry.name}" is already installed`,
          message: `You already have a connector named "${entry.name}". You can manage it in MCP Servers.`,
        },
        { status: 409 },
      )
    }

    // Check if the entry has env keys that need to be filled
    const hasRequiredEnvKeys = entry.envKeys?.some((k) => k.required)
    if (hasRequiredEnvKeys) {
      // Try to auto-fill from user's stored API keys and global env
      const envObj: Record<string, string> = {}

      // First, try user's stored GitHub token from the accounts table
      if (entry.envKeys?.some((k) => k.autoFillFrom === 'GITHUB_TOKEN')) {
        try {
          const { getUserGitHubToken } = await import('@/lib/github/user-token')
          const githubToken = await getUserGitHubToken()
          if (githubToken) {
            const gitHubEnvKey = entry.envKeys.find((k) => k.autoFillFrom === 'GITHUB_TOKEN')
            if (gitHubEnvKey) envObj[gitHubEnvKey.key] = githubToken
          }
        } catch {
          // Fall through to process.env fallback
        }
      }

      // Then try user's stored platform API keys
      if (entry.envKeys?.some((k) => k.autoFillFrom && k.autoFillFrom !== 'GITHUB_TOKEN')) {
        try {
          const { getUserApiKeys } = await import('@/lib/api-keys/user-keys')
          const userKeys = await getUserApiKeys()
          if (userKeys) {
            for (const envKey of entry.envKeys || []) {
              if (envKey.autoFillFrom === 'AI_GATEWAY_API_KEY' && userKeys.AI_GATEWAY_API_KEY) {
                envObj[envKey.key] = userKeys.AI_GATEWAY_API_KEY
              } else if (envKey.autoFillFrom === 'OPENAI_API_KEY' && userKeys.OPENAI_API_KEY) {
                envObj[envKey.key] = userKeys.OPENAI_API_KEY
              } else if (envKey.autoFillFrom === 'ANTHROPIC_API_KEY' && userKeys.ANTHROPIC_API_KEY) {
                envObj[envKey.key] = userKeys.ANTHROPIC_API_KEY
              }
            }
          }
        } catch {
          // Fall through to process.env fallback
        }
      }

      // Global env var fallback for any remaining missing keys
      for (const envKey of entry.envKeys || []) {
        if (!envObj[envKey.key]) {
          if (envKey.key.includes('VERCEL_TOKEN') && process.env.SANDBOX_VERCEL_TOKEN) {
            envObj[envKey.key] = process.env.SANDBOX_VERCEL_TOKEN
          } else if (envKey.autoFillFrom === 'AI_GATEWAY_API_KEY' && process.env.AI_GATEWAY_API_KEY) {
            envObj[envKey.key] = process.env.AI_GATEWAY_API_KEY
          } else if (envKey.autoFillFrom === 'OPENAI_API_KEY' && process.env.OPENAI_API_KEY) {
            envObj[envKey.key] = process.env.OPENAI_API_KEY
          }
        }
      }

      const connectorId = nanoid()
      await db.insert(connectors).values({
        id: connectorId,
        userId: session.user.id,
        name: entry.name,
        description: entry.description,
        type: entry.type,
        baseUrl: entry.baseUrl || null,
        command: entry.command || null,
        env: Object.keys(envObj).length > 0 ? encrypt(JSON.stringify(envObj)) : null,
        status: 'connected',
      })

      return NextResponse.json({
        success: true,
        connectorId,
        name: entry.name,
        needsEnv: hasRequiredEnvKeys && Object.keys(envObj).length === 0,
        message: `"${entry.name}" installed. ${hasRequiredEnvKeys ? 'Configure environment variables in Settings.' : ''}`,
      })
    }

    // Simple install (no env keys)
    const connectorId = nanoid()
    // OAuth-required servers get created in 'disconnected' status to signal config needed
    const needsOAuthConfig = entry.requiresOAuth === true
    await db.insert(connectors).values({
      id: connectorId,
      userId: session.user.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      baseUrl: entry.baseUrl || null,
      command: entry.command || null,
      status: needsOAuthConfig ? 'disconnected' : 'connected',
    })

    const installHint = entry.installHint || null

    return NextResponse.json({
      success: true,
      connectorId,
      name: entry.name,
      needsOAuth: needsOAuthConfig,
      installHint,
      message: needsOAuthConfig
        ? `"${entry.name}" installed. Configure OAuth in Settings to activate it.`
        : `"${entry.name}" installed successfully`,
    })
  } catch (error) {
    console.error('Error installing marketplace MCP server:', error)
    return NextResponse.json({ success: false, error: 'Failed to install MCP server' }, { status: 500 })
  }
}
