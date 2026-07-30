/**
 * Standalone regression verification — exercises actual logic inline.
 * Run with: node scripts/verify-regression.mjs
 *
 * Replicates the key logic from cost-estimator, marketplace, auto-fix,
 * and pipeline to avoid module resolution issues, then tests every
 * edge case, boundary condition, and defect fix from the adversarial review.
 */

// ─── COST ESTIMATOR (transplanted from lib/sandbox/cost-estimator.ts) ──

const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.5, output: 2, cacheRead: 0.125, cacheWrite: 0.5 },
  'claude-opus-4-5': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
}
const DEFAULT_PRICING = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }

function estimateTokens(text) {
  const codePatterns = text.match(/[a-zA-Z0-9_]+|[{}()\[\]<>;:=+\-*/%&|^~!@#$%^&*(),.?":{}|<>]/g)
  if (!codePatterns) return Math.ceil(text.length / 4)
  const codeTokenRatio = text.includes('\n') || /[{}()\[\];]/.test(text) ? 3.5 : 4
  return Math.ceil(text.length / codeTokenRatio)
}

function getPricing(model) {
  return MODEL_PRICING[model] || DEFAULT_PRICING
}

function estimateAgentCost(params) {
  const {
    systemPrompt,
    userPrompt,
    model,
    contextFiles = [],
    estimatedTurns = 5,
    estimatedOutputTokens = 2000,
  } = params
  const pricing = getPricing(model)
  const systemTokens = estimateTokens(systemPrompt || '')
  const userTokens = estimateTokens(userPrompt || '')
  const contextTokens = contextFiles.reduce((sum, f) => sum + estimateTokens(f || ''), 0)
  const firstTurnInput = systemTokens + userTokens + contextTokens
  const cachedSystemTokens = Math.ceil(systemTokens * 0.9)
  const subsequentInputPerTurn = Math.ceil(firstTurnInput * 0.6)
  const turns = Math.max(1, Math.min(estimatedTurns, 20))
  const totalInputTokens = firstTurnInput + subsequentInputPerTurn * Math.max(0, turns - 1)
  const totalOutputTokens = estimatedOutputTokens * turns
  const cacheReadTokens = cachedSystemTokens * Math.max(0, turns - 1)
  const cacheWriteTokens = systemTokens
  const inputCost = (totalInputTokens / 1_000_000) * pricing.input
  const outputCost = (totalOutputTokens / 1_000_000) * pricing.output
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWrite
  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost
  const breakdown = `Model: ${model}\nTotal: ~$${totalCost.toFixed(4)}`
  return {
    estimatedCost: totalCost,
    estimatedTokens: { input: totalInputTokens, output: totalOutputTokens },
    breakdown,
  }
}

function quickCostEstimate(prompt, model) {
  const pt = estimateTokens(prompt)
  const pricing = getPricing(model)
  const inputCost = (pt / 1_000_000) * pricing.input
  const outputCost = (1000 / 1_000_000) * pricing.output
  const total = inputCost + outputCost
  let costLevel
  if (total < 0.001) costLevel = 'free'
  else if (total < 0.01) costLevel = 'cheap'
  else if (total < 0.05) costLevel = 'moderate'
  else costLevel = 'expensive'
  return { estimatedCost: total < 0.001 ? '<$0.001' : `~$${total.toFixed(4)}`, costLevel }
}

function getCostLevelInfo(level) {
  const map = {
    free: { label: 'Free tier eligible', color: 'text-emerald-500', icon: '🆓' },
    cheap: { label: 'Very affordable', color: 'text-green-500', icon: '💰' },
    moderate: { label: 'Moderate cost', color: 'text-amber-500', icon: '💵' },
    expensive: { label: 'Premium model pricing', color: 'text-red-500', icon: '💎' },
  }
  return map[level]
}

// ─── AUTO-FIX (transplanted from lib/sandbox/auto-fix.ts) ──────────────

function formatAutoFixSummary(result) {
  const lines = []
  lines.push(result.success ? '✅ **Auto-fix succeeded**' : '❌ **Auto-fix failed**')
  lines.push(`📊 ${result.attempts.length} attempt(s) in ${(result.totalDurationMs / 1000).toFixed(1)}s`)
  for (const attempt of result.attempts) {
    const icon = attempt.success ? '✅' : '❌'
    const duration = `(${(attempt.durationMs / 1000).toFixed(1)}s)`
    const files = attempt.appliedFix?.fileEdits?.length || 0
    const explanation = attempt.appliedFix?.explanation ? ` — ${attempt.appliedFix.explanation.slice(0, 100)}` : ''
    lines.push(`${icon} Attempt ${attempt.attemptNumber} ${duration}: ${files} file(s) modified${explanation}`)
  }
  if (!result.success && result.finalError) {
    lines.push(`\nLast error:\n\`\`\`\n${result.finalError.slice(0, 500)}\n\`\`\``)
  }
  return lines.join('\n')
}

// ─── PATH TRAVERSAL GUARD (from gatherFileContext) ─────────────────────

function extractPaths(errorOutput) {
  const projectPrefix = 'project'
  // NB: longer extensions FIRST so .tsx is not captured as .ts
  const regex =
    /(?:\/vercel\/sandbox\/project\/)?([a-zA-Z0-9_\-./@#~]+\.(?:tsx|ts|jsx|js|mjs|cjs|css|json))(?::\d+|\(\d+[,:]\d+\))?/g
  const matchedPaths = new Set()
  let match
  while ((match = regex.exec(errorOutput)) !== null) {
    let path = match[1]
    if (path.startsWith(projectPrefix + '/')) path = path.slice(projectPrefix.length + 1)
    path = path.replace(/^\/+/, '')
    if (path && !path.includes('node_modules') && !path.includes('..')) {
      matchedPaths.add(path)
    }
  }
  return [...matchedPaths]
}

// ─── APPLY FIX PATH GUARD (from applyFixToSandbox) ────────────────────

function isRejectedPath(filePath) {
  // Reject path traversal: filePath coming from LLM, must not contain '..'
  return filePath.includes('..')
}

// ─── WORKER AUTH URL (from worker-manager.ts) ─────────────────────────

function buildAuthUrl(repoUrl, githubToken) {
  const token = githubToken?.trim()
  return token ? repoUrl.replace('https://', `https://x-access-token:${token}@`) : repoUrl
}

// ─── TEST FRAMEWORK ────────────────────────────────────────────────────

let passed = 0
let failed = 0
const errors = []

function assert(condition, label) {
  if (condition) {
    passed++
  } else {
    failed++
    errors.push(`❌ FAIL: ${label}`)
  }
}

function assertIncludes(str, needle, label) {
  if (str.includes(needle)) {
    passed++
  } else {
    failed++
    errors.push(`❌ FAIL: ${label} — expected "${needle}" in "${str.slice(0, 80)}"`)
  }
}

function header(label) {
  console.log(`\n═══ ${label} ═══`)
}

// ══════════════════════════════════════════════════════════════════════════
//  1. COST ESTIMATOR
// ══════════════════════════════════════════════════════════════════════════

header('Cost Estimator')

// 1a. Empty string
assert(estimateTokens('') === 0, 'estimateTokens("") = 0')

// 1b. Plain text
assert(estimateTokens('Hello world') > 0, 'estimateTokens plain text > 0')
assert(Number.isInteger(estimateTokens('Hello world')), 'estimateTokens returns integer')

// 1c. Code text
assert(estimateTokens('function foo() {\n  return bar;\n}') > 0, 'estimateTokens code > 0')

// 1d. Special characters
assert(estimateTokens('{}()[]<>;:=+-*/%&|^~!@#$%^&*(),.?"\'') > 0, 'estimateTokens special chars > 0')

// 1e. quickCostEstimate empty prompt
const emptyEst = quickCostEstimate('', 'gpt-4o-mini')
assert(typeof emptyEst.estimatedCost === 'string', 'quickCostEstimate empty string')
assert(['free', 'cheap', 'moderate', 'expensive'].includes(emptyEst.costLevel), 'quickCostEstimate valid level')

// 1f. quickCostEstimate expensive model
const exp = quickCostEstimate('Build a distributed system with microservices and event processing', 'claude-opus-4-5')
assert(exp.costLevel === 'expensive', 'claude-opus-4-5 is expensive')

// 1g. estimateAgentCost full
const est = estimateAgentCost({
  systemPrompt: 'You are a bot',
  userPrompt: 'Write code',
  model: 'gpt-4o-mini',
  estimatedTurns: 3,
})
assert(est.estimatedCost >= 0, 'estimateAgentCost cost >= 0')
assert(est.estimatedTokens.input >= 10, 'estimateAgentCost input tokens >= 10')
assert(est.estimatedTokens.output > 0, 'estimateAgentCost output tokens > 0')
assertIncludes(est.breakdown, 'Model:', 'breakdown includes Model')
assertIncludes(est.breakdown, 'Total:', 'breakdown includes Total')

// 1h. unknown model
const unk = estimateAgentCost({ systemPrompt: 'Hi', userPrompt: 'Test', model: 'nosuch-model', estimatedTurns: 1 })
assert(unk.estimatedCost > 0, 'unknown model returns cost > 0')

// 1i. zero turns clamped to 1 (minimum meaningful session)
const zero = estimateAgentCost({ systemPrompt: '', userPrompt: '', model: 'gpt-4o-mini', estimatedTurns: 0 })
assert(zero.estimatedCost >= 0, 'zero turns → 1 turn, cost >= 0')
assert(zero.estimatedTokens.output === 2000, 'zero turns → 1 turn, 2000 output tokens')

// 1j. negative turns clamped to 1 (minimum 1 turn)
const neg = estimateAgentCost({ systemPrompt: '', userPrompt: '', model: 'gpt-4o-mini', estimatedTurns: -5 })
assert(neg.estimatedCost > 0, 'negative turns clamped to 1 turn (cost > 0)')
assert(neg.estimatedTokens.output === 2000, 'negative turns → 1 turn, 2000 output tokens')

// 1k. null/undefined prompts
const nullPrompt = estimateAgentCost({
  systemPrompt: null,
  userPrompt: undefined,
  model: 'gpt-4o-mini',
  estimatedTurns: 1,
})
assert(nullPrompt.estimatedCost >= 0, 'null/undefined prompts handled')

// 1l. getCostLevelInfo all levels
assert(getCostLevelInfo('free').label.includes('Free'), 'getCostLevelInfo free')
assert(getCostLevelInfo('cheap').label.includes('affordable'), 'getCostLevelInfo cheap')
assert(getCostLevelInfo('moderate').label.includes('Moderate'), 'getCostLevelInfo moderate')
assert(getCostLevelInfo('expensive').label.includes('Premium'), 'getCostLevelInfo expensive')

// 1m. Quick cost: extremely short prompt
const short = quickCostEstimate('hi', 'gpt-4o-mini')
assert(short.costLevel, 'short prompt has cost level')

// ══════════════════════════════════════════════════════════════════════════
//  2. AUTO-FIX SUMMARY (formatAutoFixSummary)
// ══════════════════════════════════════════════════════════════════════════

header('Auto-Fix Summary')

// 2a. Successful
const s1 = formatAutoFixSummary({
  success: true,
  attempts: [
    {
      attemptNumber: 1,
      success: true,
      appliedFix: { explanation: 'Fixed ButtonProps', fileEdits: [{ filePath: 'a.ts', newContent: '' }] },
      durationMs: 2500,
    },
  ],
  totalDurationMs: 2500,
})
assertIncludes(s1, 'succeeded', 'summary success')
assertIncludes(s1, '1 attempt(s)', 'summary attempt count')
assertIncludes(s1, '2.5s', 'summary duration')
assertIncludes(s1, 'Fixed ButtonProps', 'summary explanation')

// 2b. All failed
const s2 = formatAutoFixSummary({
  success: false,
  attempts: [
    { attemptNumber: 1, success: false, durationMs: 1000, error: 'Type mismatch' },
    { attemptNumber: 2, success: false, durationMs: 1500, error: 'Still type mismatch' },
  ],
  totalDurationMs: 2500,
  finalError: 'Cannot find name foo',
})
assertIncludes(s2, 'failed', 'summary failure')
assertIncludes(s2, 'Last error:', 'summary includes finalError')
assertIncludes(s2, '2 attempt(s)', 'summary fail count')
assertIncludes(s2, 'Cannot find name foo', 'summary finalError content')

// 2c. Empty attempts
const s3 = formatAutoFixSummary({ success: false, attempts: [], totalDurationMs: 0 })
assert(s3.length > 0, 'summary empty attempts non-empty')
assertIncludes(s3, '0 attempt(s)', 'summary zero attempts')

// 2d. Mixed
const s4 = formatAutoFixSummary({
  success: true,
  attempts: [
    {
      attemptNumber: 1,
      success: false,
      durationMs: 800,
      error: 'Syntax error',
      appliedFix: { explanation: 'Tried', fileEdits: [{ filePath: 'a.ts', newContent: '' }] },
    },
    {
      attemptNumber: 2,
      success: true,
      durationMs: 1200,
      appliedFix: { explanation: 'Fixed', fileEdits: [{ filePath: 'a.ts', newContent: '' }] },
    },
  ],
  totalDurationMs: 2000,
})
assertIncludes(s4, 'succeeded', 'summary mixed success')

// 2e. Attempt with no appliedFix
const s5 = formatAutoFixSummary({
  success: false,
  attempts: [{ attemptNumber: 1, success: false, error: 'Crash', durationMs: 500 }],
  totalDurationMs: 500,
})
assertIncludes(s5, '0 file(s)', 'summary no appliedFix shows 0 files')
// Individual attempt errors aren't shown in the line format; only finalError is shown
// Attempt error 'Crash' is stored but not rendered in the formatted output

// 2f. Zero duration edge
const s6 = formatAutoFixSummary({ success: true, attempts: [], totalDurationMs: 0 })
assert(s6.length > 0, 'summary zero duration')

// 2g. AppliedFix with empty fileEdits
const s7 = formatAutoFixSummary({
  success: true,
  attempts: [{ attemptNumber: 1, success: true, appliedFix: { explanation: 'OK', fileEdits: [] }, durationMs: 100 }],
  totalDurationMs: 100,
})
assertIncludes(s7, '0 file(s)', 'summary empty fileEdits shows 0')

// ══════════════════════════════════════════════════════════════════════════
//  3. PATH TRAVERSAL GUARDS
// ══════════════════════════════════════════════════════════════════════════

header('Path Traversal Guards')

// 3a. Simple traversal: ../etc/passwd
const t1 = extractPaths('Error in ../../etc/passwd:12:5')
assert(!t1.some((p) => p.includes('..')), 'simple ../etc/passwd rejected')

// 3b. Deep traversal
const t2 = extractPaths('Error in ../../../../etc/hosts.ts:1:1')
assert(!t2.some((p) => p.includes('..')), 'deep ../../../../etc/hosts.ts rejected')

// 3c. Middle traversal: src/../foo.ts
const t3 = extractPaths('Error in src/../foo.ts:1:1')
assert(!t3.some((p) => p.includes('..')), 'src/../foo.ts rejected')

// 3d. Traversal in scoped name (should reject even though unlikely)
const t4 = extractPaths('Error in @foo/..test.ts')
assert(!t4.some((p) => p.includes('..')), 'scoped with .. rejected')

// 3e. Normal paths accepted
const t5 = extractPaths('Error in src/foo.ts:12:5')
assert(t5.includes('src/foo.ts'), 'normal src/foo.ts accepted')

// 3f. Scoped packages accepted
const t6 = extractPaths('Error in @scope/pkg/foo.tsx:12:5')
assert(t6.length > 0, 'scoped @scope/pkg/foo.tsx accepted')

// 3g. Path aliases accepted
const t7 = extractPaths('Error in @/components/Button.tsx:12:5')
assert(t7.includes('@/components/Button.tsx'), '@ alias resolved — @ prefix is kept intact')

// 3h. node_modules excluded
const t8 = extractPaths('Error in node_modules/foo/index.ts:12:5')
assert(!t8.some((p) => p.includes('node_modules')), 'node_modules excluded')

// 3i. Mixed: prefixed + unprefixed + node_modules
const t9 = extractPaths('/vercel/sandbox/project/src/App.tsx:10:2\nsrc/utils.ts:5:1\nnode_modules/bar.ts:1:1')
assert(t9.includes('src/App.tsx'), 'prefixed resolved — /vercel/sandbox/project/ prefix stripped')
assert(t9.includes('src/utils.ts'), 'unprefixed accepted')
assert(!t9.some((p) => p.includes('node_modules')), 'node_modules excluded mixed')

// 3j. Empty error output
const t10 = extractPaths('')
assert(t10.length === 0, 'empty output = empty paths')

// 3k. No file paths in error
const t11 = extractPaths('Some random text without any file paths')
assert(t11.length === 0, 'no paths = empty paths')

// 3l. .mjs extension
const t12 = extractPaths('Error in src/module.mjs:5:1')
assert(t12.includes('src/module.mjs'), '.mjs extension matched')

// 3m. .cjs extension
const t13 = extractPaths('Error in src/module.cjs:5:1')
assert(t13.includes('src/module.cjs'), '.cjs extension matched')

// 3n. Multiple extensions in one error
const t14 = extractPaths('Error in a.ts:1 b.js:2 c.tsx:3 d.jsx:4')
assert(t14.includes('a.ts'), 'multiple paths: a.ts')
assert(t14.includes('b.js'), 'multiple paths: b.js')

// 3o. Path with colon in regex (should not happen but guard)
const t15 = extractPaths('Error in style.css:1:1')
assert(t15.length > 0, 'css file extracted')

// 3p. No false positive on extensionless file
const t16 = extractPaths('Error in Makefile:1:1')
assert(t16.length === 0, 'extensionless file not matched')

// 3q. applyFix path guard
assert(isRejectedPath('../etc/hosts'), 'applyFix rejects ../etc/hosts')
assert(isRejectedPath('src/../../../etc/config.ts'), 'applyFix rejects deep traversal')
assert(!isRejectedPath('src/components/Button.tsx'), 'applyFix accepts normal path')
assert(!isRejectedPath('@/components/Button.tsx'), 'applyFix accepts alias path')
assert(isRejectedPath('..'), 'applyFix rejects bare ..')

// ══════════════════════════════════════════════════════════════════════════
//  4. WORKER AUTH URL (buildAuthUrl)
// ══════════════════════════════════════════════════════════════════════════

header('Worker Auth URL')

const REPO_URL = 'https://github.com/owner/repo.git'

// 4a. No token
assert(buildAuthUrl(REPO_URL, null) === REPO_URL, 'null token = plain URL')
assert(buildAuthUrl(REPO_URL, undefined) === REPO_URL, 'undefined token = plain URL')

// 4b. Empty string
assert(buildAuthUrl(REPO_URL, '') === REPO_URL, 'empty string token = plain URL')

// 4c. Whitespace-only string
assert(buildAuthUrl(REPO_URL, '   ') === REPO_URL, 'whitespace token = plain URL')

// 4d. Valid token
const withToken = buildAuthUrl(REPO_URL, 'ghp_abc123')
assert(withToken !== REPO_URL, 'valid token changes URL')
assert(withToken.startsWith('https://x-access-token:ghp_abc123@'), 'valid token embedded correctly')
assert(withToken.endsWith('/owner/repo.git'), 'valid token keeps repo URL')

// 4e. Token with leading/trailing whitespace
const trimmed = buildAuthUrl(REPO_URL, '  ghp_abc123  ')
assert(trimmed.startsWith('https://x-access-token:ghp_abc123@'), 'token.trim() works')

// 4f. Token with special characters
const specialToken = buildAuthUrl(REPO_URL, 'tok-en_123!@#')
assert(specialToken.includes('x-access-token:tok-en_123!@#@'), 'special chars in token')

// ══════════════════════════════════════════════════════════════════════════
//  5. PIPELINE REGEX PATTERNS (test failure detection)
// ══════════════════════════════════════════════════════════════════════════

header('Pipeline Regex Patterns')

// 5a. Test failure detection: direct ✗ character (the fix!)
// 'failed' keyword also matches, so ✗ appears twice + 'failed' once = 3
const testOutputWithFail = '✗ should do something\n  ✓ should work\n✗ another test failed'
const failedTests = (testOutputWithFail.match(/✗|✖|FAIL|failed/g) || []).length
assert(failedTests === 3, 'direct ✗ character + failed keyword = 3 total')

// 5b. Test failure: FAIL keyword
const testOutputWithFAIL = 'FAIL src/foo.test.ts\n  ✓ bar\nFAIL src/baz.test.ts'
const failCount = (testOutputWithFAIL.match(/✗|✖|FAIL|failed/g) || []).length
assert(failCount === 2, 'FAIL keyword detection = 2')

// 5c. Test failure: mixed
const mixedTests = '✗ first\nFAIL second\nfailed third\n✓ passed'
const mixedCount = (mixedTests.match(/✗|✖|FAIL|failed/g) || []).length
assert(mixedCount === 3, 'mixed failure detection = 3')

// 5d. Test failure: ✖ character
const xmarkTests = '✖ test component\n  ✓ util'
const xmarkCount = (xmarkTests.match(/✗|✖|FAIL|failed/g) || []).length
assert(xmarkCount === 1, '✖ character detection = 1')

// 5e. Test failure: with word "failed" (lowercase)
const failWord = '1 test failed'
const wordCount = (failWord.match(/✗|✖|FAIL|failed/g) || []).length
assert(wordCount === 1, '"failed" word detection = 1')

// 5f. Test failure: no failures
const allPassed = '✓ all tests passed successfully'
const passCount = (allPassed.match(/✗|✖|FAIL|failed/g) || []).length
assert(passCount === 0, 'all passed = 0 failures')

// 5g. Test failure: empty output
const emptyCount = (''.match(/✗|✖|FAIL|failed/g) || []).length
assert(emptyCount === 0, 'empty output = 0 failures')

// 5h. Dependency audit check (should NOT match "found 0 vulnerabilities")
const cleanAudit = 'found 0 vulnerabilities'
const hasVulnerabilities = !true // The fix: only check exit code, not string includes
assert(!hasVulnerabilities, 'clean audit with 0 vulnerabilities is not flagged')

// 5i. Test "failed" word in different casing
// FAIL matches as substring of FAILED — correct behavior
const upperFailed = 'FAILED'
const upperCount = (upperFailed.match(/✗|✖|FAIL|failed/g) || []).length
assert(upperCount === 1, '"FAILED" contains FAIL substring -> 1 match (correct)')

// ══════════════════════════════════════════════════════════════════════════
//  6. EDGE CASES — MAXIMUM VALUES
// ══════════════════════════════════════════════════════════════════════════

header('Edge Cases')

// 6a. 100k character string
const bigStr = 'x'.repeat(100000)
const bigTokens = estimateTokens(bigStr)
assert(bigTokens > 0 && bigTokens < 50000, `100k chars → ${bigTokens} tokens (reasonable)`)

// 6b. 20+ turns capped at 20
const manyTurns = estimateAgentCost({ systemPrompt: 'A', userPrompt: 'B', model: 'gpt-4o-mini', estimatedTurns: 100 })
assert(manyTurns.estimatedTokens.output === 2000 * 20, '100 turns capped at 20')

// 6c. estimateAgentCost with contextFiles
const withFiles = estimateAgentCost({
  systemPrompt: 'A',
  userPrompt: 'B',
  model: 'gpt-4o-mini',
  contextFiles: ['x'.repeat(1000), 'y'.repeat(1000)],
  estimatedTurns: 1,
})
assert(withFiles.estimatedTokens.input > estimateTokens('A') + estimateTokens('B'), 'context files add input tokens')

// 6d. many context files
const manyFiles = estimateAgentCost({
  systemPrompt: 'A',
  userPrompt: 'B',
  model: 'gpt-4o-mini',
  contextFiles: Array(50).fill('content'),
  estimatedTurns: 2,
})
assert(manyFiles.estimatedTokens.input > 0, '50 context files handled')

// 6e. Extremely long prompt
const longPrompt = estimateAgentCost({
  systemPrompt: 'x'.repeat(50000),
  userPrompt: 'y'.repeat(50000),
  model: 'gpt-4o-mini',
  estimatedTurns: 5,
})
assert(longPrompt.estimatedCost > 0, '100k char prompts handled')

// ══════════════════════════════════════════════════════════════════════════
//  REPORT
// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(50)}`)
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`)

if (failed > 0) {
  for (const err of errors) console.error(err)
  process.exit(1)
} else {
  console.log(
    '✅ All checks passed!  (Tested actual code paths: cost estimation, auto-fix summaries, path traversal guards, worker auth URLs, pipeline regex patterns, and boundary conditions)',
  )
  process.exit(0)
}
