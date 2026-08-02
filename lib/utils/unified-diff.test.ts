import { describe, expect, it } from 'vitest'
import { unifiedDiffToContents } from './unified-diff'

describe('unifiedDiffToContents', () => {
  it('parses a hunk with context, additions, and deletions', () => {
    const patch = '@@ -1,3 +1,5 @@\n const a = 1\n+const b = 2\n-const c = 3\n const d = 4'
    expect(unifiedDiffToContents(patch)).toEqual({
      oldContent: 'const a = 1\nconst c = 3\nconst d = 4',
      newContent: 'const a = 1\nconst b = 2\nconst d = 4',
    })
  })

  it('parses a pure addition hunk (new file)', () => {
    const patch = '@@ -0,0 +1,2 @@\n+const a = 1\n+const b = 2'
    expect(unifiedDiffToContents(patch)).toEqual({
      oldContent: '',
      newContent: 'const a = 1\nconst b = 2',
    })
  })

  it('parses a pure deletion hunk', () => {
    const patch = '@@ -1,3 +0,0 @@\n-const a = 1\n-const b = 2\n-const c = 3'
    expect(unifiedDiffToContents(patch)).toEqual({
      oldContent: 'const a = 1\nconst b = 2\nconst c = 3',
      newContent: '',
    })
  })

  it('handles Windows CRLF line endings inside the patch', () => {
    const patch = '@@ -1,2 +1,2 @@\r\n const a = 1\r\n-const b = 2\r\n+const b = 3'
    expect(unifiedDiffToContents(patch)).toEqual({
      oldContent: 'const a = 1\nconst b = 2',
      newContent: 'const a = 1\nconst b = 3',
    })
  })

  it('skips diff headers before the first hunk (full-file patch)', () => {
    const patch =
      'diff --git a/src/index.ts b/src/index.ts\n' +
      'index abc123..def456 100644\n' +
      '--- a/src/index.ts\n' +
      '+++ b/src/index.ts\n' +
      '@@ -1,2 +1,2 @@\n' +
      ' const a = 1\n' +
      '-const b = 2\n' +
      '+const b = 3'
    expect(unifiedDiffToContents(patch)).toEqual({
      oldContent: 'const a = 1\nconst b = 2',
      newContent: 'const a = 1\nconst b = 3',
    })
  })

  it('skips the "No newline at end of file" marker', () => {
    const patch = '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file'
    expect(unifiedDiffToContents(patch)).toEqual({
      oldContent: 'old',
      newContent: 'new',
    })
  })

  it('returns null for empty or hunk-less input', () => {
    expect(unifiedDiffToContents('')).toBeNull()
    expect(unifiedDiffToContents('   ')).toBeNull()
    expect(unifiedDiffToContents('just some random text')).toBeNull()
  })
})
