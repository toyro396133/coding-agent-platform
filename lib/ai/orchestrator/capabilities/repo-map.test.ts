import { describe, expect, it, vi } from 'vitest'
import type { CommandResult } from '@/lib/sandbox/commands'
import type { SandboxBridge } from '../runtime/sandbox-bridge'
import { buildRepoMap, listSourceFiles } from './repo-map'

type RunInProjectArgs = { command: string; args: string[] }

/** Captures the args passed to runInProject so assertions don't depend on
 *  vi.fn's mock.calls tuple typing. */
function mockRunInProject(result: CommandResult) {
  const calls: RunInProjectArgs[] = []
  const fn = vi.fn(async (command: string, args: string[] = []) => {
    calls.push({ command, args })
    return result
  })
  return { fn, calls }
}

function makeBridge(runInProject: ReturnType<typeof vi.fn>): SandboxBridge {
  return {
    isAvailable: vi.fn(() => true),
    runInProject,
  } as unknown as SandboxBridge
}

describe('listSourceFiles', () => {
  it('builds the find pipeline through sh -c with a real pipe (not a quoted arg)', async () => {
    // Regression guard: runInProject quotes every arg, so a literal '|' arg was
    // NOT a pipe and the file list was always empty. The command must be built
    // via sh -c with an unquoted pipe inside the inner shell.
    const { fn: runInProject, calls } = mockRunInProject({
      success: true,
      output: 'lib/ai/router.ts\napp/page.tsx\n',
    })
    const bridge = makeBridge(runInProject)

    const files = await listSourceFiles(bridge, '.', 100)

    expect(files).toEqual(['app/page.tsx', 'lib/ai/router.ts']) // ranked: shallower first
    expect(runInProject).toHaveBeenCalledTimes(1)
    expect(calls[0].command).toBe('sh')
    expect(calls[0].args).toHaveLength(2)
    const [flag, commandStr] = calls[0].args
    expect(flag).toBe('-c')
    expect(commandStr).toContain('find')
    expect(commandStr).toContain('| head -2000')
    // The pipe must NOT appear as a separately-quoted argument
    expect(commandStr).not.toContain("'|'")
    expect(commandStr).toContain("-not -path '*/node_modules/*'")
  })

  it('filters out non-source files and honors maxFiles', async () => {
    const allFiles = [
      'lib/ai/router.ts',
      'package.json',
      'pnpm-lock.yaml',
      'app/page.tsx',
      'lib/db/client.ts',
      'README.md',
      'styles.css',
      'server.py',
      'cmd/server.go',
    ].join('\n')
    const { fn: runInProject } = mockRunInProject({ success: true, output: allFiles })
    const bridge = makeBridge(runInProject)

    const files = await listSourceFiles(bridge, '.', 3)
    // Shallowest (depth-1) source files first: app/page.tsx, lib/*, server.py, cmd/*
    expect(files.length).toBeLessThanOrEqual(3)
    expect(files).toContain('app/page.tsx')
    expect(files).not.toContain('package.json')
    expect(files).not.toContain('pnpm-lock.yaml')
    expect(files).not.toContain('README.md')
    expect(files).not.toContain('styles.css')
  })

  it('escapes single quotes in rootDir', async () => {
    const { fn: runInProject, calls } = mockRunInProject({ success: true, output: '' })
    const bridge = makeBridge(runInProject)

    await listSourceFiles(bridge, "some dir/'quoted'", 10)
    const commandStr = calls[0].args[1]
    expect(commandStr).toContain("find 'some dir/'\\''quoted'\\'''")
  })
})

describe('buildRepoMap', () => {
  it('returns an empty result when no sandbox is available', async () => {
    const { fn: runInProject } = mockRunInProject({ success: true, output: '' })
    const bridge = makeBridge(runInProject)
    vi.spyOn(bridge, 'isAvailable').mockReturnValue(false)
    const result = await buildRepoMap(bridge)
    expect(result.text).toBe('')
    expect(result.totalFiles).toBe(0)
  })

  it('returns an empty result when file listing fails', async () => {
    const { fn: runInProject } = mockRunInProject({ success: false, error: 'no sandbox', output: '' })
    const bridge = makeBridge(runInProject)
    vi.spyOn(bridge, 'isAvailable').mockReturnValue(true)
    const result = await buildRepoMap(bridge)
    expect(result.text).toBe('')
    expect(result.totalFiles).toBe(0)
  })
})
