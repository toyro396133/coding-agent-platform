import { describe, expect, it } from 'vitest'
import { buildCodexConfigToml } from './codex'

describe('buildCodexConfigToml (shared config builder)', () => {
  it('uses the Vercel AI Gateway provider for vck_ keys', () => {
    const toml = buildCodexConfigToml('openai/gpt-4o', 'vck_abc123')
    expect(toml).toContain('model = "openai/gpt-4o"')
    expect(toml).toContain('model_provider = "vercel-ai-gateway"')
    expect(toml).toContain('base_url = "https://ai-gateway.vercel.sh/v1"')
    expect(toml).toContain('wire_api = "responses"')
  })

  it('uses the OpenAI provider for sk- keys', () => {
    const toml = buildCodexConfigToml('openai/gpt-4o', 'sk-test-key')
    expect(toml).toContain('model_provider = "openai"')
    expect(toml).toContain('base_url = "https://api.openai.com/v1"')
  })

  it('appends local MCP servers with command and args', () => {
    const toml = buildCodexConfigToml('gpt-4o', 'vck_x', [
      {
        id: 'm1',
        userId: 'u1',
        name: 'My Server',
        description: 'desc',
        type: 'local',
        command: 'node server.js --port 4000',
        baseUrl: null,
        oauthClientId: null,
        oauthClientSecret: null,
        env: null,
        status: 'connected',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    expect(toml).toContain('[mcp_servers.my-server]')
    expect(toml).toContain('command = "node"')
    expect(toml).toContain('args = ["server.js", "--port", "4000"]')
  })

  it('appends remote MCP servers with url and bearer token', () => {
    const toml = buildCodexConfigToml('gpt-4o', 'vck_x', [
      {
        id: 'm2',
        userId: 'u1',
        name: 'Remote API',
        description: 'desc',
        type: 'remote',
        command: null,
        baseUrl: 'https://mcp.example.com/sse',
        oauthClientId: null,
        oauthClientSecret: 'secret-token',
        env: null,
        status: 'connected',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    expect(toml).toContain('experimental_use_rmcp_client = true')
    expect(toml).toContain('[mcp_servers.remote-api]')
    expect(toml).toContain('url = "https://mcp.example.com/sse"')
    expect(toml).toContain('bearer_token = "secret-token"')
  })

  it('omits MCP config entirely when no servers are given', () => {
    const toml = buildCodexConfigToml('gpt-4o', 'vck_x')
    expect(toml).not.toContain('mcp_servers')
    expect(toml).not.toContain('experimental_use_rmcp_client')
  })
})
