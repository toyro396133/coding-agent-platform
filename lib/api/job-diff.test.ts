import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mocks so the vi.mock factories can reference them
const h = vi.hoisted(() => ({
  getUserGitHubTokenByUserId: vi.fn(),
  reposGet: vi.fn(),
  compareCommits: vi.fn(),
}))

vi.mock('@/lib/github/user-token', () => ({
  getUserGitHubTokenByUserId: h.getUserGitHubTokenByUserId,
}))

vi.mock('@octokit/rest', () => {
  class MockOctokit {
    rest: {
      repos: { get: typeof h.reposGet; compareCommits: typeof h.compareCommits }
    }

    constructor() {
      this.rest = {
        repos: {
          get: h.reposGet,
          compareCommits: h.compareCommits,
        },
      }
    }
  }
  return { Octokit: MockOctokit }
})

import { buildJobDiff, buildJobDiffForTask, clearJobDiffCache } from './job-diff'

const REPO_URL = 'https://github.com/acme/widgets.git'
const BRANCH = 'feat/big-change'

function mockCompareResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      html_url: 'https://github.com/acme/widgets/compare/main...feat/big-change',
      truncated: false,
      files: [
        {
          filename: 'src/index.ts',
          status: 'modified',
          additions: 4,
          deletions: 2,
          changes: 6,
          patch: '@@ -1,3 +1,5 @@\n+const a = 1',
        },
        {
          filename: 'logo.png',
          status: 'added',
          additions: 0,
          deletions: 0,
          changes: 0,
          patch: null,
        },
        {
          filename: 'README.md',
          status: 'deleted',
          additions: 0,
          deletions: 5,
          changes: 5,
          patch: '@@ -1,5 +0,0 @@',
        },
      ],
      ...overrides,
    },
  }
}

describe('buildJobDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The module-level diff cache must not leak state across tests
    clearJobDiffCache()
    h.getUserGitHubTokenByUserId.mockResolvedValue('ghp_mock-token-123')
    h.reposGet.mockResolvedValue({ data: { default_branch: 'main' } })
    h.compareCommits.mockResolvedValue(mockCompareResponse())
  })

  it('returns null when repoUrl is missing', async () => {
    const diff = await buildJobDiff({ userId: 'u1', repoUrl: null, branchName: BRANCH })
    expect(diff).toBeNull()
    expect(h.compareCommits).not.toHaveBeenCalled()
  })

  it('returns null when branchName is missing', async () => {
    const diff = await buildJobDiff({ userId: 'u1', repoUrl: REPO_URL, branchName: null })
    expect(diff).toBeNull()
  })

  it('returns null for non-GitHub repository URLs', async () => {
    const diff = await buildJobDiff({
      userId: 'u1',
      repoUrl: 'https://gitlab.com/acme/widgets.git',
      branchName: BRANCH,
    })
    expect(diff).toBeNull()
    expect(h.compareCommits).not.toHaveBeenCalled()
  })

  it('resolves the default branch and diffs base...head with the user token', async () => {
    await buildJobDiff({ userId: 'u1', repoUrl: REPO_URL, branchName: BRANCH })

    expect(h.reposGet).toHaveBeenCalledWith({ owner: 'acme', repo: 'widgets' })
    expect(h.compareCommits).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      base: 'main',
      head: BRANCH,
    })
  })

  it('prefers the PR base ref over the default branch when provided', async () => {
    await buildJobDiff({
      userId: 'u1',
      repoUrl: REPO_URL,
      branchName: BRANCH,
      prBaseRef: 'develop',
    })

    expect(h.compareCommits).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      base: 'develop',
      head: BRANCH,
    })
    expect(h.reposGet).not.toHaveBeenCalled()
  })

  it('maps files to the structured contract with language and binary detection', async () => {
    const diff = await buildJobDiff({ userId: 'u1', repoUrl: REPO_URL, branchName: BRANCH })

    expect(diff).not.toBeNull()
    expect(diff?.base_ref).toBe('main')
    expect(diff?.head_ref).toBe(BRANCH)
    expect(diff?.compare_url).toContain('compare/main...feat/big-change')
    expect(diff?.summary).toEqual({ files_changed: 3, additions: 4, deletions: 7 })

    const [ts, png, md] = diff?.files ?? []
    expect(ts).toMatchObject({
      filename: 'src/index.ts',
      status: 'modified',
      additions: 4,
      deletions: 2,
      changes: 6,
      language: 'typescript',
      is_binary: false,
      previous_filename: null,
    })
    expect(ts.patch).toContain('+const a = 1')

    // Binary file: no patch, marked as binary, no language
    expect(png).toMatchObject({ filename: 'logo.png', is_binary: true, language: 'text' })
    expect(png.patch).toBeNull()

    expect(md).toMatchObject({ filename: 'README.md', status: 'deleted', language: 'markdown' })
  })

  it('honors the truncated flag from GitHub', async () => {
    h.compareCommits.mockResolvedValue(mockCompareResponse({ truncated: true }))
    const diff = await buildJobDiff({ userId: 'u1', repoUrl: REPO_URL, branchName: BRANCH })
    expect(diff?.truncated).toBe(true)
  })

  it('returns null when the GitHub compare API fails', async () => {
    h.compareCommits.mockRejectedValue(new Error('404 Not Found'))
    const diff = await buildJobDiff({ userId: 'u1', repoUrl: REPO_URL, branchName: BRANCH })
    expect(diff).toBeNull()
  })

  it('falls back to the default branch name when the repo metadata lookup fails', async () => {
    // getDefaultBranch swallows the error and falls back to 'main' so a
    // transient repo-metadata failure never breaks diff computation.
    h.reposGet.mockRejectedValue(new Error('rate limited'))
    const diff = await buildJobDiff({ userId: 'u1', repoUrl: REPO_URL, branchName: BRANCH })

    expect(diff).not.toBeNull()
    expect(diff?.base_ref).toBe('main')
    expect(h.compareCommits).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      base: 'main',
      head: BRANCH,
    })
  })
})

describe('buildJobDiffForTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearJobDiffCache()
    h.getUserGitHubTokenByUserId.mockResolvedValue('ghp_mock-token-123')
    h.reposGet.mockResolvedValue({ data: { default_branch: 'main' } })
    h.compareCommits.mockResolvedValue(mockCompareResponse())
  })

  it('returns null for non-completed tasks without touching GitHub', async () => {
    const diff = await buildJobDiffForTask(
      { status: 'pending', repoUrl: REPO_URL, branchName: BRANCH, prMergeCommitSha: null },
      'u1',
    )
    expect(diff).toBeNull()
    expect(h.compareCommits).not.toHaveBeenCalled()
  })

  it('returns null when the task has no branch', async () => {
    const diff = await buildJobDiffForTask(
      { status: 'completed', repoUrl: REPO_URL, branchName: null, prMergeCommitSha: null },
      'u1',
    )
    expect(diff).toBeNull()
    expect(h.compareCommits).not.toHaveBeenCalled()
  })

  it('builds a diff for a completed task using the branch as head', async () => {
    const diff = await buildJobDiffForTask(
      { status: 'completed', repoUrl: REPO_URL, branchName: BRANCH, prMergeCommitSha: null },
      'u1',
    )
    expect(diff).not.toBeNull()
    expect(h.compareCommits).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      base: 'main',
      head: BRANCH,
    })
  })

  it('prefers the merge commit SHA as head for merged PRs', async () => {
    const diff = await buildJobDiffForTask(
      { status: 'completed', repoUrl: REPO_URL, branchName: BRANCH, prMergeCommitSha: 'abc123' },
      'u1',
    )
    expect(diff).not.toBeNull()
    expect(h.compareCommits).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'widgets',
      base: 'main',
      head: 'abc123',
    })
  })

  it('propagates a failed compare as null', async () => {
    h.compareCommits.mockRejectedValue(new Error('404 Not Found'))
    const diff = await buildJobDiffForTask(
      { status: 'completed', repoUrl: REPO_URL, branchName: BRANCH, prMergeCommitSha: null },
      'u1',
    )
    expect(diff).toBeNull()
  })
})
