import { Octokit } from '@octokit/rest'
import { parseGitHubUrl } from '@/lib/github/client'
import { getUserGitHubTokenByUserId } from '@/lib/github/user-token'
import { getLanguageFromFilename, isBinaryFile } from '@/lib/utils/file-language'

/**
 * Structured Diff/Patch contract for the external agent API.
 *
 * The roadmap's Phase 2 (2.3) API contract required: a strict JSON format for
 * returning the Diff (a clear Patch structure), detailed error structure with
 * codes, cancellation, and idempotency. Cancellation and idempotency already
 * exist — this module completes the missing piece: a normalized, documented
 * diff shape computed from GitHub's compare API so external clients can apply
 * the changes without parsing free-text.
 *
 * The structured error codes/details now live in ./job-errors.ts
 * (deriveErrorDetails) — see that module for the Error details & codes contract.
 *
 * Shape (per file):
 *   { filename, status, additions, deletions, changes, patch, language, is_binary, previous_filename? }
 */

export interface JobDiffFile {
  /** Path of the changed file in the repo */
  filename: string
  /** Git change status: added / modified / deleted / renamed / copied / changed / unchanged */
  status: string
  /** Lines added */
  additions: number
  /** Lines deleted */
  deletions: number
  /** Total changed lines (additions + deletions) */
  changes: number
  /** Unified diff hunks for this file (null for binary files) */
  patch: string | null
  /** Detected programming language from the file extension */
  language: string
  /** True when the file is binary (image, archive, media, ...) */
  is_binary: boolean
  /** Original path when the file was renamed */
  previous_filename?: string | null
}

export interface JobDiff {
  /** Base ref the diff was computed against (e.g. the PR base branch) */
  base_ref: string
  /**
   * Head ref being diffed. Normally the task's branch name; for merged PRs the
   * feature branch may be deleted, in which case this is the merge commit SHA.
   */
  head_ref: string
  /** GitHub compare URL for reference */
  compare_url: string
  /** Per-file structured diff */
  files: JobDiffFile[]
  /** Aggregate counters */
  summary: {
    files_changed: number
    additions: number
    deletions: number
  }
  /** True when GitHub truncated the patch content (very large diffs) */
  truncated: boolean
  /** Unix timestamp of when the diff was generated */
  generated_at: number
}

export interface BuildJobDiffOptions {
  userId: string
  repoUrl?: string | null
  branchName?: string | null
  /** Optional PR base branch name to compare against instead of the default branch */
  prBaseRef?: string | null
  /** Optional explicit head ref (e.g. the PR merge commit SHA) to diff against */
  headRef?: string | null
}

/**
 * In-memory TTL cache for computed diffs. A completed job's diff never changes,
 * so pollers hitting GET /jobs/[jobId] repeatedly don't re-trigger GitHub API
 * calls on every request.
 */
const DIFF_CACHE_TTL_MS = 5 * 60 * 1000
// Transient failures (rate limit, transient 404) are cached for much shorter so
// a temporarily-failing diff can recover quickly instead of masking for 5 min.
const DIFF_FAILURE_CACHE_TTL_MS = 30 * 1000
const diffCache = new Map<string, { expiresAt: number; diff: JobDiff | null }>()

function cacheKey(options: BuildJobDiffOptions): string {
  return `${options.userId}:${options.repoUrl || ''}:${options.branchName || ''}:${options.prBaseRef || ''}:${options.headRef || ''}`
}

function getCachedDiff(key: string): JobDiff | null | undefined {
  const entry = diffCache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    diffCache.delete(key)
    return undefined
  }
  return entry.diff
}

function setCachedDiff(key: string, diff: JobDiff | null, isFailure = false): void {
  const ttl = isFailure ? DIFF_FAILURE_CACHE_TTL_MS : DIFF_CACHE_TTL_MS
  diffCache.set(key, { expiresAt: Date.now() + ttl, diff })
  // Opportunistic cleanup so the map can't grow unbounded on busy instances
  if (diffCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of diffCache) {
      if (now > v.expiresAt) diffCache.delete(k)
    }
  }
}

/**
 * Clear the in-memory diff cache.
 *
 * Test-only in practice: exported so a module-level cache cannot leak state
 * across test cases. Kept public so runtime invalidation remains possible if a
 * cache key ever needs explicit eviction.
 */
export function clearJobDiffCache(): void {
  diffCache.clear()
}

/**
 * Resolve the repository's default branch via the GitHub API. Falls back to
 * 'main' (then 'master') without erroring so a misconfigured repo never breaks
 * the diff computation.
 */
async function getDefaultBranch(octokit: Octokit, owner: string, repo: string): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo })
    if (data.default_branch) {
      return data.default_branch
    }
  } catch {
    // fall through to the hard-coded default
  }
  return 'main'
}

/**
 * Compute a structured diff for a task's branch against its base (PR base when
 * known, otherwise the repository default branch).
 *
 * Best-effort: returns `null` when the diff cannot be computed (unauthenticated
 * access to a private repo, missing repo/branch metadata, or a transient API
 * error) so the calling endpoint can degrade gracefully.
 */
export async function buildJobDiff(options: BuildJobDiffOptions): Promise<JobDiff | null> {
  const { userId, repoUrl, branchName } = options

  if (!repoUrl || !branchName) {
    return null
  }

  const parsed = parseGitHubUrl(repoUrl)
  if (!parsed) {
    return null
  }
  const { owner, repo } = parsed

  const key = cacheKey(options)
  const cached = getCachedDiff(key)
  if (cached !== undefined) {
    return cached
  }

  try {
    const token = await getUserGitHubTokenByUserId(userId)
    const octokit = new Octokit({ auth: token || undefined })

    const baseRef = options.prBaseRef || (await getDefaultBranch(octokit, owner, repo))
    // For merged PRs the feature branch may have been deleted — the merge
    // commit SHA is a stable head ref in that case.
    const headRef = options.headRef || branchName

    // TODO(api-contract): when the task has an open PR on a non-default base
    // branch (e.g. develop), pass that base via prBaseRef for an exact compare.
    // The task row stores prNumber but not the base branch name, so deriving it
    // requires one extra pulls.get call — deferred to keep this best-effort.

    const compare = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseRef,
      head: headRef,
    })

    const files: JobDiffFile[] = (compare.data.files || []).map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changes: file.changes ?? (file.additions ?? 0) + (file.deletions ?? 0),
      patch: file.patch ?? null,
      language: getLanguageFromFilename(file.filename),
      is_binary: !file.patch || isBinaryFile(file.filename),
      previous_filename: file.previous_filename ?? null,
    }))

    const additions = files.reduce((sum, f) => sum + f.additions, 0)
    const deletions = files.reduce((sum, f) => sum + f.deletions, 0)

    const diff: JobDiff = {
      base_ref: baseRef,
      head_ref: headRef,
      compare_url: compare.data.html_url || `https://github.com/${owner}/${repo}/compare/${baseRef}...${headRef}`,
      files,
      summary: {
        files_changed: files.length,
        additions,
        deletions,
      },
      truncated: isCompareTruncated(compare.data),
      generated_at: Math.floor(Date.now() / 1000),
    }

    setCachedDiff(key, diff)
    return diff
  } catch (_error) {
    // Best-effort: log server-side only (no dynamic values per security policy)
    console.error('Failed to build job diff')
    setCachedDiff(key, null, true)
    return null
  }
}

export interface JobDiffTaskRef {
  /** Task status — only 'completed' produces a diff */
  status: string
  repoUrl?: string | null
  branchName?: string | null
  prMergeCommitSha?: string | null
}

/**
 * Compute the structured diff for a task's current state. Only meaningful once
 * the job is 'completed' and has a branch; returns `null` otherwise.
 *
 * Shared by GET /jobs/[jobId] (polling) and the SSE job stream (terminal
 * events) so streaming clients receive the patch without an extra poll. For
 * merged PRs the feature branch may be deleted, so the merge commit SHA is
 * preferred as the head ref. Best-effort: never throws.
 */
export async function buildJobDiffForTask(task: JobDiffTaskRef, userId: string): Promise<JobDiff | null> {
  if (task.status !== 'completed' || !task.branchName) {
    return null
  }
  return buildJobDiff({
    userId,
    repoUrl: task.repoUrl,
    branchName: task.branchName,
    prBaseRef: null,
    headRef: task.prMergeCommitSha || task.branchName,
  })
}

/**
 * GitHub's compare response includes a `truncated` boolean, but the Octokit
 * generated type does not always surface it. Read it defensively.
 */
function isCompareTruncated(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const record = data as Record<string, unknown>
  return record.truncated === true
}
