# Error Details & Codes — JSON Schema & Reference

> **Source of truth:** `lib/api/job-errors.ts` — `ERROR_CODE_CATALOG` (18 codes) + `deriveErrorDetails()`.
> **Machine-readable schema:** [`public/schemas/error-details.schema.json`](../../public/schemas/error-details.schema.json)
> **Last updated:** 2 באוגוסט 2026

The external agent API classifies every failed or stopped job into a stable,
machine-readable error object (Roadmap "Error details & codes"). Clients can
react to failures without parsing free-text messages.

---

## 1. Where the error object appears

| Endpoint | Location | Shape |
|---|---|---|
| `GET /api/agent/v1/jobs/[jobId]` | `platform_metadata.error_details` | Full `error_details` object |
| `GET /api/agent/v1/jobs/[jobId]` | `platform_metadata.error_code` | `string \| null` (shortcut) |
| `GET /api/agent/v1/jobs/[jobId]` | `platform_metadata.error` | Readable message (shortcut) |
| `GET /api/agent/v1/jobs/[jobId]/stream` | Terminal `platform.job.status` event | `error_code` + `error_details` |
| `POST /api/agent/v1/chat/completions` | — | A job that later fails will surface the details via the two endpoints above |

`error_details` is `null` for non-terminal statuses (`pending`, `processing`,
`completed`). For `completed` jobs the object is `null` — there is no failure.

---

## 2. JSON Schema

The full draft-07 schema is available at
`public/schemas/error-details.schema.json` (fetched from
`/schemas/error-details.schema.json` at runtime). Summary:

```jsonc
{
  "type": "object",
  "properties": {
    "code":          { "$ref": "#/definitions/JobErrorCode" },
    "category":      { "$ref": "#/definitions/JobErrorCategory" },
    "stage":         { "type": ["string", "null"] },
    "message":       { "type": ["string", "null"] },
    "retryable":     { "type": "boolean" },
    "recovery_hint": { "type": ["string", "null"] },
    "failedAt":      { "type": ["string", "null"], "format": "date-time" }
  },
  "required": ["code", "category", "stage", "message", "retryable", "recovery_hint", "failedAt"],
  "additionalProperties": false
}
```

### Field reference

| Field | Type | Description |
|---|---|---|
| `code` | `string` (enum) | Stable machine-readable code — see §3. |
| `category` | `string` (enum) | Coarse grouping — see §4. |
| `stage` | `string \| null` | Failing pipeline stage when determinable (e.g. `"Type Check"`, `"Tests"`, `"Push"`). `null` when unknown. |
| `message` | `string \| null` | Readable error message. When `tasks.error` holds the structured envelope, this is the envelope's `message` — never raw JSON. |
| `retryable` | `boolean` | `true` when resubmitting has a realistic chance of success. |
| `recovery_hint` | `string \| null` | Static, client-facing guidance. Never contains dynamic values. |
| `failedAt` | `string \| null` | ISO-8601 timestamp of when the failure was recorded. |

---

## 3. All JobErrorCodes (18)

> Order follows the catalog in `ERROR_CODE_CATALOG`. `cancelled` and
> `unknown_failure` are not produced by pattern matching — `cancelled` comes
> from the `stopped` status and `unknown_failure` is the fallback when nothing
> matches.

| Code | Category | Stage | Retryable |
|---|---|---|---|
| `cancelled` | cancellation | — | ❌ |
| `sandbox_timeout` | infrastructure | Sandbox | ✅ |
| `rate_limited` | limits | — | ✅ |
| `auth_error` | authentication | — | ❌ |
| `dependency_install_failed` | infrastructure | Dependencies | ✅ |
| `build_failed` | build | Type Check | ✅ |
| `test_failed` | verification | Tests | ✅ |
| `lint_failed` | verification | Lint & Format | ✅ |
| `git_clone_failed` | git | Clone | ✅ |
| `worker_failed` | agent | Worker Team | ✅ |
| `git_push_failed` | git | Push | ❌ |
| `agent_install_failed` | agent | Agent Setup | ✅ |
| `orchestrator_failed` | agent | Orchestrator | ✅ |
| `budget_exceeded` | limits | — | ❌ |
| `visual_qa_failed` | verification | Visual Verification | ✅ |
| `sandbox_creation_failed` | infrastructure | Sandbox | ✅ |
| `agent_failed` | agent | Agent Execution | ✅ |
| `unknown_failure` | unknown | — | ✅ |

---

## 4. JobErrorCategories (9)

| Category | Meaning |
|---|---|
| `cancellation` | Job was stopped by the user. |
| `build` | Type-check / build / compilation failures. |
| `verification` | Tests, lint, or visual QA failed. |
| `infrastructure` | Sandbox, dependency install, or provisioning issues. |
| `authentication` | GitHub/API-key/permission problems. |
| `git` | Clone or push failures. |
| `agent` | Coding agent or worker-team execution failures. |
| `limits` | Rate limits, budget, token, or step limits. |
| `unknown` | No rule matched — fallback classification. |

---

## 5. Example responses

### 5.1 Failed job (`build_failed`) — GET `/jobs/[jobId]`

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "TS2307: Cannot find module '@/lib/foo'" },
      "finish_reason": "content_filter"
    }
  ],
  "platform_metadata": {
    "job_id": "abc123",
    "object": "platform.job",
    "status": "error",
    "error": "TS2307: Cannot find module '@/lib/foo'",
    "error_code": "build_failed",
    "error_details": {
      "code": "build_failed",
      "category": "build",
      "stage": "Type Check",
      "message": "TS2307: Cannot find module '@/lib/foo'",
      "retryable": true,
      "recovery_hint": "Fix the reported TypeScript/build errors and resubmit.",
      "failedAt": "2026-08-02T10:15:30.000Z"
    },
    "terminal": true,
    "result": "TS2307: Cannot find module '@/lib/foo'"
  }
}
```

### 5.2 Stopped job (`cancelled`)

```json
{
  "platform_metadata": {
    "status": "stopped",
    "error_code": "cancelled",
    "error_details": {
      "code": "cancelled",
      "category": "cancellation",
      "stage": null,
      "message": "Task stopped",
      "retryable": false,
      "recovery_hint": "The job was stopped. Resubmit the job to start a fresh run.",
      "failedAt": null
    },
    "terminal": true
  }
}
```

### 5.3 Unknown failure (fallback)

```json
{
  "platform_metadata": {
    "status": "error",
    "error_code": "unknown_failure",
    "error_details": {
      "code": "unknown_failure",
      "category": "unknown",
      "stage": null,
      "message": "Some unexpected error",
      "retryable": true,
      "recovery_hint": "The job failed for an unknown reason. Review the logs and retry.",
      "failedAt": "2026-08-02T11:00:00.000Z"
    }
  }
}
```

### 5.4 Streaming terminal event (SSE)

```
data: {"id":"job-sync-abc123-1754151600","object":"platform.job.status","created":1754151600,"status":"error","progress":100,"error_code":"test_failed","error_details":{"code":"test_failed","category":"verification","stage":"Tests","message":"1 test failed","retryable":true,"recovery_hint":"Fix the failing tests and resubmit.","failedAt":"2026-08-02T12:00:00.000Z"}}
```

---

## 6. Structured `tasks.error` envelope (v1)

Failures are persisted in the `tasks.error` column as a small JSON envelope so
classification survives across requests. `deriveErrorDetails` treats an
envelope as authoritative (no pattern matching) and falls back to
log/message classification only for legacy plain-text errors.

```jsonc
{
  "v": 1,                  // envelope version — lets parsers reject arbitrary JSON
  "code": "build_failed",  // JobErrorCode
  "stage": "Type Check",   // string | null
  "message": "...",        // string | null
  "failedAt": "2026-08-02T10:15:30.000Z"  // string | null
}
```

### `recovery_hint` values by code

| Code | Recovery hint |
|---|---|
| `cancelled` | The job was stopped. Resubmit the job to start a fresh run. |
| `sandbox_timeout` | Increase the max duration or use a smaller repository, then resubmit. |
| `rate_limited` | Wait for the rate-limit window to reset, then resubmit. |
| `auth_error` | Reconnect the GitHub account or add the required provider API key, then resubmit. |
| `dependency_install_failed` | Fix the dependency installation issue (registry access, lockfile) and resubmit. |
| `build_failed` | Fix the reported TypeScript/build errors and resubmit. |
| `test_failed` | Fix the failing tests and resubmit. |
| `lint_failed` | Fix the lint/format errors and resubmit. |
| `git_clone_failed` | Verify the repository URL and access permissions, then resubmit. |
| `worker_failed` | The worker team failed; resubmit or reduce the team size. |
| `git_push_failed` | Check branch permissions and the GitHub connection, then resubmit. |
| `agent_install_failed` | Retry with a different agent, or configure the agent CLI and resubmit. |
| `orchestrator_failed` | The orchestrator failed while planning/refining the request; resubmit or simplify the prompt. |
| `budget_exceeded` | Reduce the request scope (shorter prompt, fewer steps) and resubmit. |
| `visual_qa_failed` | Visual QA failed to verify the UI; check the screenshots/dev server and resubmit. |
| `sandbox_creation_failed` | Sandbox provisioning failed; retry in a moment. |
| `agent_failed` | The coding agent failed; consider a different agent/model and resubmit. |
| `unknown_failure` | The job failed for an unknown reason. Review the logs and retry. |

---

## 7. Implementation notes

- Classification runs in `deriveErrorDetails({ status, error, logs })` — `logs`
  are only consulted in the legacy plain-text path; a valid envelope returns
  immediately.
- Rules are ordered by specificity (timeout/auth before generic agent/git).
  `worker_failed` precedes `git_push_failed` so worker-team push failures are
  classified as retryable `worker_failed`, not `git_push_failed`.
- Keep this doc, `public/schemas/error-details.schema.json`, and
  `ERROR_CODE_CATALOG` in sync when adding codes.
