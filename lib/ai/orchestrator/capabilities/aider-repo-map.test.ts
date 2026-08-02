import { describe, it, expect } from 'vitest'
import { extractFileSymbols, buildAiderRepoMapText, estimateTokens, type RepoMapFile } from './aider-repo-map'

describe('extractFileSymbols — TypeScript (AST)', () => {
  const tsContent = `import { z } from 'zod'
import type { ToolContext } from './types'

export async function createSandbox(config: SandboxConfig, logger: TaskLogger): Promise<SandboxResult> {
  return { success: true }
}

function internalHelper(): void {}

export class SandboxBridge {
  private taskId: string

  constructor(taskId: string) {
    this.taskId = taskId
  }

  isAvailable(): boolean {
    return true
  }

  async readFile(path: string, offset?: number): Promise<string> {
    return ''
  }
}

export interface PipelineStageData {
  name: string
  status: 'pending' | 'passed'
}

export type CapabilityLevel = 'basic' | 'enhanced' | 'auto'

export enum TaskStatus {
  Pending = 'pending',
  Done = 'done',
}

export const MAX_STEPS: number = 30
export let globalCounter: number = 0
const secretInternal = 42
`

  it('extracts exported functions with async + signatures', () => {
    const symbols = extractFileSymbols(tsContent, 'lib/sandbox/creation.ts')
    const create = symbols.find((s) => s.name === 'createSandbox')
    expect(create).toBeDefined()
    expect(create!.kind).toBe('function')
    expect(create!.signature).toContain('export async function createSandbox')
    expect(create!.signature).toContain('config: SandboxConfig')
    expect(create!.signature).toContain('Promise<SandboxResult>')
  })

  it('extracts non-exported functions', () => {
    const symbols = extractFileSymbols(tsContent, 'lib/sandbox/creation.ts')
    const helper = symbols.find((s) => s.name === 'internalHelper')
    expect(helper).toBeDefined()
    expect(helper!.signature).toContain('function internalHelper')
    expect(helper!.signature).not.toContain('export')
  })

  it('extracts classes with method signatures (no bodies)', () => {
    const symbols = extractFileSymbols(tsContent, 'lib/sandbox/creation.ts')
    const cls = symbols.find((s) => s.name === 'SandboxBridge')
    expect(cls).toBeDefined()
    expect(cls!.kind).toBe('class')
    expect(cls!.signature).toContain('export class SandboxBridge')
    expect(cls!.methods).toBeDefined()
    expect(cls!.methods!).toContain('isAvailable(): boolean')
    expect(cls!.methods!).toContain('readFile(path: string, offset?: number): Promise<string>')
    // No method body text leaked into signatures
    for (const m of cls!.methods!) {
      expect(m).not.toContain('return')
    }
  })

  it('extracts interfaces, types and enums', () => {
    const symbols = extractFileSymbols(tsContent, 'lib/sandbox/creation.ts')
    expect(symbols.find((s) => s.name === 'PipelineStageData')).toMatchObject({
      kind: 'interface',
      signature: 'export interface PipelineStageData',
    })
    expect(symbols.find((s) => s.name === 'CapabilityLevel')).toMatchObject({
      kind: 'type',
      signature: 'export type CapabilityLevel',
    })
    expect(symbols.find((s) => s.name === 'TaskStatus')).toMatchObject({
      kind: 'enum',
      signature: 'export enum TaskStatus',
    })
  })

  it('extracts exported consts but ignores non-exported ones', () => {
    const symbols = extractFileSymbols(tsContent, 'lib/sandbox/creation.ts')
    expect(symbols.find((s) => s.name === 'MAX_STEPS')).toMatchObject({
      kind: 'const',
      signature: 'export const MAX_STEPS: number',
    })
    expect(symbols.find((s) => s.name === 'globalCounter')).toMatchObject({
      kind: 'const',
      signature: 'export let globalCounter: number',
    })
    expect(symbols.find((s) => s.name === 'secretInternal')).toBeUndefined()
  })

  it('extracts symbols from TSX files', () => {
    const tsx = `export default function App(): JSX.Element {
  return <div>hi</div>
}
`
    const symbols = extractFileSymbols(tsx, 'components/app.tsx')
    expect(symbols.find((s) => s.name === 'App')).toMatchObject({
      kind: 'function',
      signature: 'export function App(): JSX.Element',
    })
  })
})

describe('extractFileSymbols — fallback languages', () => {
  it('extracts Python defs and classes', () => {
    const py = `import os

async def fetch_data(url: str, timeout: int = 5) -> dict:
    pass

class UserService:
    def get(self, user_id):
        pass
`
    const symbols = extractFileSymbols(py, 'services/user.py')
    expect(symbols.find((s) => s.name === 'fetch_data')).toMatchObject({
      kind: 'function',
      signature: 'def fetch_data(url: str, timeout: int = 5) -> dict',
    })
    expect(symbols.find((s) => s.name === 'UserService')).toMatchObject({
      kind: 'class',
      signature: 'class UserService',
    })
  })

  it('extracts Go functions', () => {
    const go = `package main

func main() {}

func (s *Server) handleRequest(r *http.Request) error {
    return nil
}
`
    const symbols = extractFileSymbols(go, 'cmd/server.go')
    expect(symbols.find((s) => s.name === 'main')).toBeDefined()
    expect(symbols.find((s) => s.name === 'handleRequest')).toBeDefined()
  })

  it('returns no symbols for unsupported files', () => {
    expect(extractFileSymbols('body { color: red }', 'styles.css')).toEqual([])
  })
})

describe('estimateTokens', () => {
  it('estimates non-zero tokens for text', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('const x = 1')).toBeGreaterThan(0)
  })
})

describe('buildAiderRepoMapText', () => {
  const files: RepoMapFile[] = [
    {
      relPath: 'lib/ai/router.ts',
      symbols: [
        {
          kind: 'function',
          name: 'routePrompt',
          signature: 'export function routePrompt(prompt: string): RoutingDecision',
        },
        {
          kind: 'class',
          name: 'SmartRouter',
          signature: 'export class SmartRouter',
          methods: ['route(): string', 'record(): void'],
        },
      ],
    },
    {
      relPath: 'lib/db/client.ts',
      symbols: [{ kind: 'const', name: 'db', signature: 'export const db: Db' }],
    },
    {
      relPath: 'app/page.tsx',
      symbols: [{ kind: 'function', name: 'Page', signature: 'export default function Page(): JSX.Element' }],
    },
  ]

  it('renders a compressed hierarchy with tree graphics', () => {
    const result = buildAiderRepoMapText(files, { maxTokens: 10000 })
    expect(result.text).toContain('lib/')
    expect(result.text).toContain('├── ai/')
    expect(result.text).toContain('router.ts')
    expect(result.text).toContain('export function routePrompt(prompt: string): RoutingDecision')
    expect(result.text).toContain('export default function Page(): JSX.Element')
    expect(result.text).toContain('# Repo Map (Aider-style — compressed)')
  })

  it('counts files with symbols and reports total files', () => {
    const result = buildAiderRepoMapText(files, { maxTokens: 10000 })
    expect(result.filesIncluded).toBe(3)
    expect(result.totalFiles).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('caps symbols per file', () => {
    const bigFile: RepoMapFile = {
      relPath: 'a.ts',
      symbols: Array.from({ length: 20 }, (_, i) => ({
        kind: 'function' as const,
        name: `fn${i}`,
        signature: `export function fn${i}(): void`,
      })),
    }
    const result = buildAiderRepoMapText([bigFile], { maxTokens: 100000, maxSymbolsPerFile: 5 })
    expect(result.text).toContain('fn0')
    expect(result.text).toContain('fn4')
    expect(result.text).not.toContain('fn5')
  })

  it('respects the token budget and marks truncation', () => {
    const result = buildAiderRepoMapText(files, { maxTokens: 30 })
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('truncated to fit token budget')
  })

  it('handles empty input gracefully — no files means no map', () => {
    const result = buildAiderRepoMapText([], { maxTokens: 1024 })
    // Empty text (not a bare header) so callers can treat it as "nothing to show"
    expect(result.text).toBe('')
    expect(result.filesIncluded).toBe(0)
    expect(result.totalFiles).toBe(0)
    expect(result.truncated).toBe(false)
  })
})
