/**
 * Minimal unified-diff parser for the JobDiff contract.
 *
 * The platform.job.diff SSE event carries per-file `patch` strings produced by
 * GitHub's compare API (unified-diff hunks, e.g. `@@ -1,3 +1,5 @@`). The task
 * page renders diffs through `generateDiffFile` which needs old/new content,
 * so this helper reconstructs the changed fragments (context + removed lines
 * for the old side, context + added lines for the new side). Rendering these
 * fragments shows exactly the patch hunks without per-file polling.
 */

export interface UnifiedDiffContents {
  oldContent: string
  newContent: string
}

export function unifiedDiffToContents(patch: string): UnifiedDiffContents | null {
  if (!patch) return null

  const oldLines: string[] = []
  const newLines: string[] = []
  let sawHunk = false

  for (const rawLine of patch.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    // Hunk header starts the meaningful section; everything before it
    // (diff --git / index / --- / +++ headers) is skipped.
    if (line.startsWith('@@')) {
      sawHunk = true
      continue
    }
    if (!sawHunk) continue
    // "\ No newline at end of file" marker
    if (line.startsWith('\\')) continue
    // Per-file renamed/header lines inside a multi-file diff
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue

    if (line.startsWith('-')) {
      oldLines.push(line.slice(1))
      continue
    }
    if (line.startsWith('+')) {
      newLines.push(line.slice(1))
      continue
    }

    // Context line (starts with a single space, or is empty)
    const context = line.startsWith(' ') ? line.slice(1) : line
    oldLines.push(context)
    newLines.push(context)
  }

  if (oldLines.length === 0 && newLines.length === 0) return null

  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n'),
  }
}
