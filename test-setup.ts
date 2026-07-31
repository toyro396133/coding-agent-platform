import { vi, beforeEach } from 'vitest'
import type { Session } from '@/lib/session/types'

// ---------------------------------------------------------------------------
// Environment variables used by the auth routes
// ---------------------------------------------------------------------------
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id-test'
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret-test'
process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'discord-client-id-test'
process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret-test'
process.env.ENCRYPTION_KEY = '000102030405060708090a0b0c0d0e0f' // 32-byte hex for tests
process.env.JWE_SECRET = 'AAAAAAAAAAAAAAAAAAAAAA' // 128-bit base64url for tests

// ---------------------------------------------------------------------------
// Mock next/headers — cookies()
// ---------------------------------------------------------------------------
const cookieStore = new Map<string, { value: string; options?: Record<string, unknown> }>()

export const mockCookieStore = {
  get: vi.fn((name: string) => cookieStore.get(name) ?? undefined),
  set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
    cookieStore.set(name, { value, options })
  }),
  delete: vi.fn((name: string) => {
    cookieStore.delete(name)
  }),
  clear: vi.fn(() => cookieStore.clear()),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => mockCookieStore),
}))

// ---------------------------------------------------------------------------
// Mock arctic — Google, Discord, OAuth2Tokens, generateState, generateCodeVerifier
// ---------------------------------------------------------------------------
export const mockGenerateState = vi.fn(() => 'mock-state-123')
export const mockGenerateCodeVerifier = vi.fn(() => 'mock-code-verifier-456')

// Shared mock token instance
const mockTokens = {
  accessToken: vi.fn(() => 'mock-access-token'),
  hasRefreshToken: vi.fn(() => false),
  refreshToken: vi.fn(() => undefined),
  accessTokenExpiresInSeconds: vi.fn(() => 3600),
  accessTokenExpiresAt: vi.fn(() => new Date(Date.now() + 3600_000)),
  idToken: vi.fn(() => undefined),
  hasScopes: vi.fn(() => true),
  scopes: vi.fn(() => []),
  tokenType: vi.fn(() => 'Bearer'),
}

export const mockValidateAuthorizationCode = vi.fn(async () => mockTokens)

class MockGoogle {
  clientId: string
  clientSecret: string
  redirectUri: string

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.redirectUri = redirectUri
  }

  createAuthorizationURL = vi.fn(
    (_state: string, _codeVerifier: string, _scopes: string[]) => {
      return new URL(
        'https://accounts.google.com/o/oauth2/v2/auth?response_type=code',
      )
    },
  )

  validateAuthorizationCode = mockValidateAuthorizationCode
}

class MockDiscord {
  clientId: string
  clientSecret: string
  redirectUri: string

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.redirectUri = redirectUri
  }

  createAuthorizationURL = vi.fn(
    (_state: string, _codeVerifier: string, _scopes: string[]) => {
      return new URL(
        'https://discord.com/api/oauth2/authorize?response_type=code',
      )
    },
  )

  validateAuthorizationCode = mockValidateAuthorizationCode
}

vi.mock('arctic', () => ({
  Google: MockGoogle,
  Discord: MockDiscord,
  OAuth2Tokens: vi.fn(),
  OAuth2RequestError: class OAuth2RequestError extends Error {
    constructor() {
      super('OAuth2 request error')
    }
  },
  generateState: mockGenerateState,
  generateCodeVerifier: mockGenerateCodeVerifier,
}))

// ---------------------------------------------------------------------------
// Mock session helpers — createGoogleSession, createDiscordSession, saveSession
// ---------------------------------------------------------------------------
export const mockSession = {
  created: Date.now(),
  authProvider: 'google' as const,
  user: {
    id: 'user-test-123',
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.png',
    locale: 'en' as const,
  },
}

export const mockCreateGoogleSession = vi.fn(async (): Promise<Session | undefined> => mockSession)
export const mockCreateDiscordSession = vi.fn(async (): Promise<Session | undefined> => ({
  ...mockSession,
  authProvider: 'discord' as const,
}))

export const mockSaveSession = vi.fn(
  async (_res: Response, _session: unknown) => 'encrypted-session-cookie',
)

vi.mock('@/lib/session/create-google', () => ({
  createGoogleSession: mockCreateGoogleSession,
  saveSession: mockSaveSession,
}))

vi.mock('@/lib/session/create-discord', () => ({
  createDiscordSession: mockCreateDiscordSession,
  saveSession: mockSaveSession,
}))

// ---------------------------------------------------------------------------
// Mock db modules — upsertUser, getUserById
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/users', () => ({
  upsertUser: vi.fn(async () => 'user-test-123'),
  getUserById: vi.fn(async () => ({
    id: 'user-test-123',
    locale: 'en',
    provider: 'google',
    externalId: 'sub-123',
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    avatarUrl: 'https://example.com/avatar.png',
    accessToken: 'encrypted-token',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
  })),
}))

// ---------------------------------------------------------------------------
// Mock crypto modules
// ---------------------------------------------------------------------------
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

vi.mock('@/lib/jwe/encrypt', () => ({
  encryptJWE: vi.fn(async () => 'jwe-encrypted-token'),
}))

// ---------------------------------------------------------------------------
// Mock isRelativeUrl
// ---------------------------------------------------------------------------
vi.mock('@/lib/utils/is-relative-url', () => ({
  isRelativeUrl: vi.fn((url: string) => {
    try {
      new URL(url)
      return false
    } catch {
      return true
    }
  }),
}))

// ---------------------------------------------------------------------------
// Helper to create a mock NextRequest
// ---------------------------------------------------------------------------
// Re-export NextRequest type for test files
import type { NextRequest } from 'next/server'

export function createMockNextRequest(
  options: {
    url?: string
    searchParams?: Record<string, string>
    headers?: Record<string, string>
  } = {},
): NextRequest {
  const baseUrl = options.url ?? 'http://localhost:3000'
  const url = new URL(baseUrl)
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value)
    }
  }
  const req = new Request(url.toString(), {
    headers: options.headers ?? {},
  })
  Object.defineProperty(req, 'nextUrl', {
    value: url,
    writable: false,
  })
  return req as unknown as NextRequest
}

// ---------------------------------------------------------------------------
// Helper to set a cookie in the mock store
// ---------------------------------------------------------------------------
export function setMockCookie(name: string, value: string): void {
  cookieStore.set(name, { value })
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  cookieStore.clear()
  mockValidateAuthorizationCode.mockResolvedValue(mockTokens)
})