import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { mockCookieStore, mockGenerateState, mockGenerateCodeVerifier, createMockNextRequest } from '@/test-setup'

describe('GET /api/auth/signin/discord', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'discord-client-id-test'
    process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret-test'
  })

  it('redirects to Discord OAuth authorization URL when configured', async () => {
    const req = createMockNextRequest()

    const response = await GET(req)

    // Should redirect to Discord
    expect(response.status).toBe(302)
    const location = response.headers.get('Location')
    expect(location).toContain('discord.com')

    // Should generate state and code verifier
    expect(mockGenerateState).toHaveBeenCalledOnce()
    expect(mockGenerateCodeVerifier).toHaveBeenCalledOnce()

    // Should set three cookies
    expect(mockCookieStore.set).toHaveBeenCalledTimes(3)
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'discord_auth_state',
      'mock-state-123',
      expect.objectContaining({ httpOnly: true, maxAge: 60 * 10 }),
    )
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'discord_auth_code_verifier',
      'mock-code-verifier-456',
      expect.objectContaining({ httpOnly: true, maxAge: 60 * 10 }),
    )
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'discord_auth_redirect_to',
      '/',
      expect.objectContaining({ httpOnly: true, maxAge: 60 * 10 }),
    )
  })

  it('stores the next redirect parameter in the cookie', async () => {
    const req = createMockNextRequest({
      searchParams: { next: '/settings' },
    })

    await GET(req)

    expect(mockCookieStore.set).toHaveBeenCalledWith('discord_auth_redirect_to', '/settings', expect.any(Object))
  })

  it('rejects absolute URLs in the next parameter (open redirect prevention)', async () => {
    const req = createMockNextRequest({
      searchParams: { next: 'https://evil.com/phish' },
    })

    await GET(req)

    // Falls back to '/'
    expect(mockCookieStore.set).toHaveBeenCalledWith('discord_auth_redirect_to', '/', expect.any(Object))
  })

  it('redirects to error page when client ID is not configured', async () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID

    const req = createMockNextRequest()
    const response = await GET(req)

    expect(response.status).toBe(302)
    const location = response.headers.get('Location')
    expect(location).toContain('error=discord_not_configured')
  })

  it('redirects to error page when client secret is not configured', async () => {
    delete process.env.DISCORD_CLIENT_SECRET

    const req = createMockNextRequest()
    const response = await GET(req)

    expect(response.status).toBe(302)
    const location = response.headers.get('Location')
    expect(location).toContain('error=discord_not_configured')
  })
})
