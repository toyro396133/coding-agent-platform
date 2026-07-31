import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import {
  mockCookieStore,
  mockValidateAuthorizationCode,
  mockCreateDiscordSession,
  mockSaveSession,
  setMockCookie,
  createMockNextRequest,
} from '@/test-setup'

describe('GET /api/auth/callback/discord', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'discord-client-id-test'
    process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret-test'
  })

  // ---- PKCE state validation ----

  it('rejects a request with no code parameter', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { state: 'valid-state' }, // no code
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request with no state parameter', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123' }, // no state
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request with mismatched state (PKCE state validation fails)', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'wrong-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request when no pre-auth cookies exist', async () => {
    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'some-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request when storedState is null but code/state are present', async () => {
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'some-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
  })

  // ---- Client credentials ----

  it('returns 500 when client ID is missing', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Discord OAuth not configured')
  })

  it('returns 500 when client secret is missing', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    delete process.env.DISCORD_CLIENT_SECRET

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Discord OAuth not configured')
  })

  // ---- Token exchange ----

  it('returns 500 when token exchange fails (OAuth2RequestError)', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    mockValidateAuthorizationCode.mockRejectedValueOnce(
      new (class extends Error {
        constructor() {
          super('OAuth2 request error')
        }
      })(),
    )

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Failed to complete Discord authentication')
  })

  it('returns 500 when token exchange fails with a generic error', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    mockValidateAuthorizationCode.mockRejectedValueOnce(new Error('Network error'))

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Failed to complete Discord authentication')
  })

  // ---- Userinfo errors ----

  it('returns 500 when session creation fails (userinfo fetch failure)', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    mockCreateDiscordSession.mockResolvedValueOnce(undefined)

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Failed to create session')
  })

  // ---- Success path ----

  it('redirects to the stored redirect_to on successful authentication', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/settings')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/settings')
  })

  it('saves the session cookie on success', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    await GET(req)

    expect(mockCreateDiscordSession).toHaveBeenCalledOnce()
    expect(mockCreateDiscordSession).toHaveBeenCalledWith('mock-access-token', undefined)
    expect(mockSaveSession).toHaveBeenCalledOnce()
  })

  it('deletes auth cookies after successful authentication', async () => {
    setMockCookie('discord_auth_state', 'valid-state')
    setMockCookie('discord_auth_code_verifier', 'valid-verifier')
    setMockCookie('discord_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    await GET(req)

    expect(mockCookieStore.delete).toHaveBeenCalledWith('discord_auth_state')
    expect(mockCookieStore.delete).toHaveBeenCalledWith('discord_auth_code_verifier')
    expect(mockCookieStore.delete).toHaveBeenCalledWith('discord_auth_redirect_to')
  })
})
