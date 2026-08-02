# חוזה האחזור של משימה — `GET /api/agent/v1/jobs/[jobId]`

> **מקור אמת (Source of Truth):** `app/api/agent/v1/jobs/[jobId]/route.ts`
> **עדכון אחרון:** 2 באוגוסט 2026

---

## 1. סקירה כללית

ה-endpoint `GET /api/agent/v1/jobs/[jobId]` מחזיר את המצב המלא של משימה (Job) שנוצרה דרך ה-API החיצוני (OpenAI-compatible chat completions): סטטוס, התקדמות, לוגים, הודעות שיחה, והתוצאה הסופית — בתגובה אחת בפורמט OpenAI-compatible. הוא משלים את זרם ה-SSE (`/stream`): לקוחות Polling מקבלים כאן את אותו המידע בלי לשמור חיבור קבוע.

**הסמכה:** נדרש כותרת `Authorization: Bearer <PLATFORM_API_KEY>` (אימות דרך `lib/auth/api-key.ts` → `validatePlatformApiKey`). המשימה חייבת להיות בבעלות מפתח ה-API.

---

## 2. פרמטרי Query

| פרמטר | סוג | ברירת מחדל | תיאור |
|--------|-----|------------|--------|
| `include_diff` | boolean | `true` | האם לחשב ולהחזיר את ה-patch המבני (`platform_metadata.diff`). העבר `false` כדי לדלג על חישוב ה-diff — ובעיקר על קריאות ה-GitHub compare API — כשהלקוח כבר קיבל את ה-patch דרך אירוע ה-`platform.job.diff` בזרם ה-SSE (מומלץ ל-pollers כדי למנוע קריאות GitHub מיותרות). |

> דוגמאות:
> ```
> GET /api/agent/v1/jobs/job_abc123
> GET /api/agent/v1/jobs/job_abc123?include_diff=false
> ```
>
> כל ערך שאינו המחרוזת המדויקת `false` מטופל כ-`true` (תאימות לאחור).

---

## 3. מבנה התשובה

תשובה `200` בפורמט `chat.completion` עם מטא-דאטה פלטפורמה מלאה:

```json
{
  "id": "chatcmpl-job_abc123",
  "object": "chat.completion",
  "created": 1722528000,
  "model": "agent-router",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "התוצאה הסופית של הסוכן" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
  "platform_metadata": {
    "job_id": "job_abc123",
    "object": "platform.job",
    "status": "completed",
    "progress": 100,
    "error": null,
    "error_code": null,
    "error_details": null,
    "terminal": true,
    "result": "התוצאה הסופית של הסוכן",
    "diff": { "base_ref": "main", "head_ref": "feat/my-change", "files": [], "summary": {}, "truncated": false, "generated_at": 1722529800 },
    "diff_included": true,
    "branch_name": "feat/my-change",
    "pr_url": "https://github.com/acme/widgets/pull/12",
    "preview_url": null,
    "sandbox_url": null,
    "selected_agent": "claude",
    "selected_model": null,
    "repo_url": "https://github.com/acme/widgets",
    "created": 1722528000,
    "updated_at": 1722529800,
    "completed_at": 1722529801,
    "logs": [ { "type": "info", "message": "Sandbox created", "timestamp": 1722528001 } ],
    "messages": [ { "id": "msg_1", "role": "user", "content": "Implement feature X", "createdAt": "2026-08-02T09:50:00.000Z" } ]
  }
}
```

### שדות מרכזיים ב-`platform_metadata`

| שדה | סוג | תיאור |
|-----|-----|--------|
| `status` | string | `pending` \| `processing` \| `completed` \| `error` \| `stopped` |
| `progress` | number | אחוז התקדמות 0–100 |
| `error_code` | string \| null | קוד שגיאה מבני — ראה [error-details-schema](./error-details-schema.md) |
| `error_details` | object \| null | מבנה השגיאה המלא (`code`, `category`, `stage`, `message`, `retryable`, `recovery_hint`, `failedAt`) |
| `terminal` | boolean | האם המשימה במצב סופי |
| `diff` | object \| null | חוזה JobDiff (פורמט Diff/Patch מבני) — `null` כשהמשימה לא `completed`, כשחישוב נכשל (למשל ריפו פרטי לא מאומת), או כשהלקוח ביקש `include_diff=false` |
| `diff_included` | boolean | `true` אם ה-diff **חושב** בתגובה זו; `false` כשהלקוח דילג עם `include_diff=false` או כשהחישוב נכשל. מאפשר ללקוח להבחין בין דילוג מכוון ל-diff שאינו זמין |
| `logs` | array | לוגי ה-pipeline: `{ type, message, timestamp }` |
| `messages` | array | הודעות השיחה (עד 100): `{ id, role, content, createdAt }` |

---

## 4. התנהגות `include_diff`

- **ברירת מחדל (`true`):** ה-diff מחושב עבור משימות `completed` עם ענף (באמצעות `buildJobDiffForTask` → GitHub compare API). יש מטמון TTL פנימי של 5 דקות, כך ש-pollers חוזרים לא פוגעים ב-GitHub בכל בקשה.
- **`include_diff=false`:** החישוב מושמט **לחלוטין** — לא נוצרות קריאות GitHub, `diff` מוחזר `null`, ו-`diff_included` מוחזר `false`. מתאים ללקוח שכבר קיבל את ה-patch באירוע הטרמינלי של ה-SSE (`platform.job.diff`) ואינו צריך אותו שוב ב-poll.
- **חישוב נכשל:** גם עם `include_diff=true`, חישוב כושל (ריפו פרטי לא מאומת, מטמון failure) → `diff: null` — התגובה לעולם לא נכשלת בגלל ה-diff.

---

## 5. טיפול בשגיאות (Error Handling)

כל שגיאה חוזרת כתגובת JSON רגילה:

| סטטוס | תרחיש | body |
|-------|-------|------|
| `401` | חסר `Authorization` header | `{ "error": { "message": "Missing Authorization header", "type": "invalid_request_error" } }` |
| `401` | מפתח API לא חוקי | `{ "error": { "message": "Invalid API key", "type": "invalid_request_error" } }` |
| `404` | המשימה לא קיימת או לא שייכת למשתמש | `{ "error": { "message": "Job not found", "type": "invalid_request_error" } }` |
| `500` | שגיאה פנימית בלתי צפויה | `{ "error": { "message": "Internal server error", "type": "api_error" } }` |

---

## 6. דוגמת לקוח (Client Example)

```ts
// Node.js / fetch example — polling without re-fetching the diff
const res = await fetch(
  `https://<host>/api/agent/v1/jobs/job_abc123?include_diff=${receivedDiffViaSse ? 'false' : 'true'}`,
  { headers: { Authorization: `Bearer ${PLATFORM_API_KEY}` } },
)

if (!res.ok) {
  const err = await res.json()
  throw new Error(err.error?.message || 'Fetch failed')
}

const { platform_metadata } = await res.json()
console.log(`status=${platform_metadata.status} progress=${platform_metadata.progress}`)
if (platform_metadata.diff_included && platform_metadata.diff) {
  console.log('Diff files:', platform_metadata.diff.files.length)
}
```

---

## 7. קבצים רלוונטיים

| קובץ | תפקיד |
|------|-------|
| `app/api/agent/v1/jobs/[jobId]/route.ts` | ה-endpoint עצמו |
| `lib/api/job-diff.ts` | חישוב חוזה ה-JobDiff (`buildJobDiffForTask` + מטמון) |
| `lib/api/job-errors.ts` | סיווג `error_code` / `error_details` (`deriveErrorDetails`) |
| `app/api/agent/v1/jobs/[jobId]/stream/route.ts` | זרם ה-SSE המשלים — ראה [job-stream-sse](./job-stream-sse.md) |
| `docs/api/error-details-schema.md` | תיעוד מלא של מבנה השגיאות |
