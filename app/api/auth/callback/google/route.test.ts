import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMockNextRequest,
  mockCookieStore,
  mockCreateGoogleSession,
  mockSaveSession,
  mockValidateAuthorizationCode,
  setMockCookie,
} from '@/test-setup'
import { GET } from './route'

describe('GET /api/auth/callback/google', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id-test'
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret-test'
  })

  // ---- PKCE state validation ----

  it('rejects a request with no code parameter', async () => {
    // Set up pre-auth cookies
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { state: 'valid-state' }, // no code
    })

    const response = await GET(req)

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request with no state parameter', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123' }, // no state
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request with mismatched state (PKCE state validation fails)', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    // state from URL doesn't match stored cookie
    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'wrong-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request when no pre-auth cookies exist', async () => {
    // No cookies set at all
    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'some-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Invalid OAuth state')
  })

  it('rejects a request when storedState is null but code/state are present', async () => {
    // Only set code verifier and redirect_to, but not state
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'some-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(400)
  })

  // ---- Client credentials ----

  it('returns 500 when client ID is missing', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Google OAuth not configured')
  })

  it('returns 500 when client secret is missing', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    delete process.env.GOOGLE_CLIENT_SECRET

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Google OAuth not configured')
  })

  // ---- Token exchange ----

  it('returns 500 when token exchange fails (OAuth2RequestError)', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

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
    expect(text).toContain('Failed to complete Google authentication')
  })

  it('returns 500 when token exchange fails with a generic error', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    mockValidateAuthorizationCode.mockRejectedValueOnce(new Error('Network error'))

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toContain('Failed to complete Google authentication')
  })

  // ---- Userinfo errors ----

  it('returns 500 when session creation fails (userinfo fetch failure)', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    mockCreateGoogleSession.mockResolvedValueOnce(undefined)

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
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/tasks')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    const response = await GET(req)

    // Should redirect to the stored redirect_to
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/tasks')
  })

  it('saves the session cookie on success', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    await GET(req)

    expect(mockCreateGoogleSession).toHaveBeenCalledOnce()
    expect(mockCreateGoogleSession).toHaveBeenCalledWith('mock-access-token', undefined)
    expect(mockSaveSession).toHaveBeenCalledOnce()
  })

  it('deletes auth cookies after successful authentication', async () => {
    setMockCookie('google_auth_state', 'valid-state')
    setMockCookie('google_auth_code_verifier', 'valid-verifier')
    setMockCookie('google_auth_redirect_to', '/')

    const req = createMockNextRequest({
      searchParams: { code: 'auth-code-123', state: 'valid-state' },
    })

    await GET(req)

    expect(mockCookieStore.delete).toHaveBeenCalledWith('google_auth_state')
    expect(mockCookieStore.delete).toHaveBeenCalledWith('google_auth_code_verifier')
    expect(mockCookieStore.delete).toHaveBeenCalledWith('google_auth_redirect_to')
  })
})
