import { describe, expect, it } from 'vitest'
import {
  deriveErrorDetails,
  formatStructuredTaskError,
  parseStructuredTaskError,
  type StructuredTaskError,
} from './job-errors'

const LOG_ENTRY = (type: string, message: string) => ({ type, message })

describe('deriveErrorDetails', () => {
  it('maps stopped status to cancelled', () => {
    const details = deriveErrorDetails({ status: 'stopped', error: 'Job was cancelled via external API' })
    expect(details).toEqual({
      code: 'cancelled',
      category: 'cancellation',
      stage: null,
      message: 'Job was cancelled via external API',
      retryable: false,
      recovery_hint: expect.any(String) as unknown,
      failedAt: null,
    })
  })

  it('returns null for non-terminal statuses', () => {
    expect(deriveErrorDetails({ status: 'completed' })).toBeNull()
    expect(deriveErrorDetails({ status: 'pending' })).toBeNull()
    expect(deriveErrorDetails({ status: 'processing' })).toBeNull()
  })

  it('classifies build/type-check failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Type check failed after auto-fix loop',
    })
    expect(details?.code).toBe('build_failed')
    expect(details?.category).toBe('build')
    expect(details?.stage).toBe('Type Check')
    expect(details?.retryable).toBe(true)
  })

  it('classifies sandbox timeouts from the task timeout message', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Task execution timed out after 5 minutes',
    })
    expect(details?.code).toBe('sandbox_timeout')
    expect(details?.category).toBe('infrastructure')
  })

  it('classifies sandbox creation timeouts', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Sandbox creation timed out. Try with a smaller repository or fewer dependencies.',
    })
    expect(details?.code).toBe('sandbox_timeout')
  })

  it('classifies auth errors (missing API keys)', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'CURSOR_API_KEY not found. Please set the API key to use Cursor agent.',
    })
    expect(details?.code).toBe('auth_error')
    expect(details?.category).toBe('authentication')
    expect(details?.retryable).toBe(false)
  })

  it('classifies Gemini authentication failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Gemini CLI authentication failed. Please set GEMINI_API_KEY.',
    })
    expect(details?.code).toBe('auth_error')
  })

  it('classifies "authentication required" messages as auth errors', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'GitHub authentication required. Please connect your GitHub account.',
    })
    expect(details?.code).toBe('auth_error')
  })

  it('classifies TS2307 missing modules as build failures, not install failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: "error TS2307: Cannot find module 'react' or its corresponding type declarations.",
    })
    expect(details?.code).toBe('build_failed')
  })

  it('classifies git push failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Failed to push changes to repository',
    })
    expect(details?.code).toBe('git_push_failed')
    expect(details?.category).toBe('git')
    expect(details?.stage).toBe('Push')
  })

  it('classifies worker-team push failures as worker_failed, not git_push_failed', () => {
    // A worker-team push failure is a retryable worker-team failure; it must
    // NOT be swallowed by the generic git_push_failed rule (checked later).
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Failed to push worker team changes to repository',
    })
    expect(details?.code).toBe('worker_failed')
    expect(details?.stage).toBe('Worker Team')
    expect(details?.retryable).toBe(true)
  })

  it('classifies dependency install failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Failed to install Node.js dependencies',
    })
    expect(details?.code).toBe('dependency_install_failed')
  })

  it('classifies test failures from error logs when no error message exists', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: null,
      logs: [LOG_ENTRY('info', 'Stage 2/6: Running test suite...'), LOG_ENTRY('error', 'Tests failed')],
    })
    expect(details?.code).toBe('test_failed')
    expect(details?.stage).toBe('Tests')
  })

  it('classifies lint failures from pipeline logs', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: null,
      logs: [LOG_ENTRY('error', 'Lint check found errors')],
    })
    expect(details?.code).toBe('lint_failed')
    expect(details?.stage).toBe('Lint & Format')
  })

  it('classifies agent execution failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Agent execution failed',
    })
    expect(details?.code).toBe('agent_failed')
  })

  it('classifies rate limiting', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Rate limit exceeded',
    })
    expect(details?.code).toBe('rate_limited')
  })

  it('falls back to unknown_failure for unclassifiable errors', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Something entirely unexpected broke',
    })
    expect(details?.code).toBe('unknown_failure')
    expect(details?.category).toBe('unknown')
    expect(details?.message).toBe('Something entirely unexpected broke')
  })

  it('detects the failing pipeline stage from logs when the rule has no fixed stage', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: null,
      logs: [LOG_ENTRY('info', 'Running type check...'), LOG_ENTRY('error', 'Type check failed')],
    })
    expect(details?.code).toBe('build_failed')
    expect(details?.stage).toBe('Type Check')
  })

  it('ignores success/command logs when classifying', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: null,
      logs: [
        LOG_ENTRY('success', 'Tests passed'),
        LOG_ENTRY('command', 'npx tsc --noEmit'),
        LOG_ENTRY('info', 'No package.json found, skipping'),
      ],
    })
    expect(details?.code).toBe('unknown_failure')
  })

  it('classifies worker team failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Worker team execution failed, falling back to standard execution',
    })
    expect(details?.code).toBe('worker_failed')
    expect(details?.stage).toBe('Worker Team')
  })

  it('classifies orchestrator failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Orchestrator evaluation failed while refining the prompt',
    })
    expect(details?.code).toBe('orchestrator_failed')
    expect(details?.category).toBe('agent')
    expect(details?.stage).toBe('Orchestrator')
  })

  it('classifies visual QA failures', () => {
    const details = deriveErrorDetails({
      status: 'error',
      error: 'Visual QA failed: screenshot capture failed during verification',
    })
    expect(details?.code).toBe('visual_qa_failed')
    expect(details?.category).toBe('verification')
    expect(details?.stage).toBe('Visual Verification')
  })

  it('uses a structured envelope as the authoritative classification', () => {
    const envelope = formatStructuredTaskError(
      { code: 'worker_failed', stage: 'Worker Team' },
      'Failed to merge',
      new Date('2026-01-02T03:04:05Z'),
    )
    const details = deriveErrorDetails({ status: 'error', error: envelope })
    expect(details?.code).toBe('worker_failed')
    expect(details?.stage).toBe('Worker Team')
    expect(details?.message).toBe('Failed to merge')
    expect(details?.failedAt).toBe('2026-01-02T03:04:05.000Z')
    expect(details?.retryable).toBe(true)
  })

  it('uses the envelope stage even when the message alone would misclassify', () => {
    // Envelope says visual_qa_failed; without it the plain text would fall to
    // unknown_failure — the envelope must win.
    const envelope = formatStructuredTaskError(
      { code: 'visual_qa_failed', stage: 'Visual Verification' },
      'A vague failure message',
      new Date('2026-01-02T03:04:05Z'),
    )
    const details = deriveErrorDetails({ status: 'error', error: envelope })
    expect(details?.code).toBe('visual_qa_failed')
    expect(details?.message).toBe('A vague failure message')
  })

  it('does not trust arbitrary JSON as a structured envelope', () => {
    const details = deriveErrorDetails({ status: 'error', error: '{"code":"unknown_failure"}' })
    // Missing the version marker → treated as plain text → unknown_failure
    expect(details?.code).toBe('unknown_failure')
    expect(parseStructuredTaskError('{"code":"unknown_failure"}')).toBeNull()
  })

  it('round-trips the structured envelope', () => {
    const envelope = formatStructuredTaskError(
      { code: 'build_failed', stage: 'Type Check' },
      'Type check failed',
      new Date('2026-01-02T03:04:05Z'),
    )
    const parsed = parseStructuredTaskError(envelope)
    expect(parsed).toMatchObject({
      code: 'build_failed',
      stage: 'Type Check',
      message: 'Type check failed',
      failedAt: '2026-01-02T03:04:05.000Z',
    } satisfies Partial<StructuredTaskError>)
    expect(parseStructuredTaskError('')).toBeNull()
    expect(parseStructuredTaskError('plain text error')).toBeNull()
  })

  it('carries failedAt from the envelope for stopped (cancelled) jobs', () => {
    const envelope = formatStructuredTaskError(
      { code: 'cancelled', stage: null },
      'Stopped by user',
      new Date('2026-01-02T03:04:05Z'),
    )
    const details = deriveErrorDetails({ status: 'stopped', error: envelope })
    expect(details?.code).toBe('cancelled')
    expect(details?.failedAt).toBe('2026-01-02T03:04:05.000Z')
  })
})
