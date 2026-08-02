# חוזה הזרמת ה-SSE — `GET /api/agent/v1/jobs/[jobId]/stream`

> **מקור אמת (Source of Truth):** `app/api/agent/v1/jobs/[jobId]/stream/route.ts`
> **עדכון אחרון:** 2 באוגוסט 2026

---

## 1. סקירה כללית

ה-endpoint `GET /api/agent/v1/jobs/[jobId]/stream` מספק הזרמת Server-Sent Events (SSE) בזמן אמת של מצב משימה (Job). הוא מיועד ללקוחות חיצוניים ומותאם לתאימות OpenAI-style streaming.

**הסמכה:** נדרש כותרת `Authorization: Bearer <PLATFORM_API_KEY>` (אימות דרך `lib/auth/api-key.ts` → `validatePlatformApiKey`). אין תמיכה בסשן דפדפן — לממשק הפנימי קיים endpoint נפרד: `GET /api/tasks/[taskId]/stream` (מבוסס סשן).

**Headers של התשובה:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

---

## 2. סוגי אירועים (Event Types)

| `object` | תיאור | מתי נשלח |
|----------|-------|----------|
| `platform.job.status` | עדכון סטטוס/התקדמות | אירוע התחלתי + על כל שינוי ב-status או progress (בדיקה כל 3 שניות) |
| `platform.job.cancelled` | ביטול המשימה | מיידית דרך event-bus (`publishJobEvent` מ-`POST .../cancel`) או כגיבוי כשמתגלה סטטוס `stopped` |
| `platform.job.diff` | ה-patch המבני (חוזה JobDiff) | רק כשהמשימה הושלמה (`completed`) — אחרי אירוע הסטטוס הטרמינלי |
| `platform.job.messages` | הודעות הסיכום של המשימה | פעם אחת בסיום, לפני `done` |
| `{ done: true }` | סימון סיום חכם (JSON) | תמיד בסיום |
| `data: [DONE]` | סימון סיום גולמי (SSE) | תמיד בסיום — אחרי `done` |
| `: ping` | Heartbeat (comment line) | כל 15 שניות — נדחה ע"י EventSource, לא מעובד כ-JSON |

> הערה: `platform.job.cancelled` נשלח **בנוסף** לאירוע סטטוס רגיל (שגם יציג `status: "stopped"`). לקוחות שמאזינים ל-SSE מקבלים התראה מיידית על ביטול בלי לחכות ל-poll הבא (3 שניות).

---

## 3. סדר הפליטה (Emission Order)

### 3.1 משימה פעילה → הושלמה (`completed`)
```
1. platform.job.status   (initial: pending/processing)
2. platform.job.status   (updates: progress / status — polling כל 3 שניות, רק על שינוי)
3. platform.job.status   (terminal: completed)
4. platform.job.diff     (JobDiff contract)
5. platform.job.messages (messages)
6. { done: true }
7. data: [DONE]
→ סגירת הזרם
```

### 3.2 משימה פעילה → שגיאה (`error`)
```
1. platform.job.status   (initial)
2. platform.job.status   (updates)
3. platform.job.status   (terminal: error — עם error_code + error_details)
4. platform.job.messages
5. { done: true }
6. data: [DONE]
→ סגירת הזרם
```

### 3.3 משימה פעילה → ביטול (`stopped`)
```
1. platform.job.status   (initial)
2. platform.job.status   (updates)
3. platform.job.cancelled  (מיידית דרך event-bus, או בגיבוי: status→stopped)
4. platform.job.messages
5. { done: true }
6. data: [DONE]
→ סגירת הזרם
```

### 3.4 התחברות למשימה שכבר במצב סופי (terminal)
כשהלקוח מתחבר אחרי שהמשימה הסתיימה, מתקבל אירוע הסטטוס הטרמינלי מיד, ואז (אם `completed`) אירוע ה-`diff` → `messages` → `done` → `[DONE]`.

### 3.5 התחברות למשימה שלא קיימת עוד / מחיקה באמצע
אם המשימה נמחקה מה-DB במהלך הזרימה, הזרם נסגר מיד עם `data: [DONE]` (בלי `platform.job.messages`).

---

## 4. שדות לכל אירוע

### 4.1 `platform.job.status`

| שדה | סוג | תיאור |
|-----|-----|--------|
| `id` | string | מזהה ייחודי לאירוע (`job-sync-<jobId>` / `job-sync-<jobId>-<timestamp>`) |
| `object` | string | `platform.job.status` |
| `created` | number | Unix timestamp (שניות) |
| `status` | string | `pending` \| `processing` \| `completed` \| `error` \| `stopped` |
| `progress` | number | אחוז התקדמות 0–100 |
| `error_code` | string \| null | קוד שגיאה מבני (למשל `build_failed`, `sandbox_timeout`, `cancelled`) — מהמנוע `lib/api/job-errors.ts` |
| `error_details` | object \| null | מבנה מלא: `code`, `category`, `stage`, `message`, `retryable`, `recovery_hint`, `failedAt` (ראה [error-details-schema](./error-details-schema.md)) |

### 4.2 `platform.job.cancelled`

| שדה | סוג | תיאור |
|-----|-----|--------|
| `id` | string | `job-cancelled-<jobId>-<timestamp>` |
| `object` | string | `platform.job.cancelled` |
| `created` | number | Unix timestamp (שניות) |
| `status` | string | `stopped` (ברירת מחדל) |
| `cancelled` | boolean | תמיד `true` |

### 4.3 `platform.job.diff`

| שדה | סוג | תיאור |
|-----|-----|--------|
| `id` | string | `job-diff-<jobId>` |
| `object` | string | `platform.job.diff` |
| `created` | number | Unix timestamp (שניות) |
| `diff` | object | חוזה JobDiff מלא (ראה למטה) |

**חוזה `diff` (JobDiff):**

| שדה | סוג | תיאור |
|-----|-----|--------|
| `base_ref` | string | בסיס ההשוואה (למשל `main`) |
| `head_ref` | string | הענף/commit שמשווים |
| `compare_url` | string | קישור GitHub compare |
| `files` | array | רשימת קבצים ששונו |
| `summary` | object | `files_changed`, `additions`, `deletions` |
| `truncated` | boolean | האם GitHub קיצץ את ה-patch |
| `generated_at` | number | Unix timestamp |

**כל רכיב ב-`files[]`:** `filename`, `status` (added/modified/deleted/renamed), `additions`, `deletions`, `changes`, `patch` (unified diff \| null לבינארי), `language`, `is_binary`, `previous_filename`.

### 4.4 `platform.job.messages`

| שדה | סוג | תיאור |
|-----|-----|--------|
| `id` | string | `job-messages-<jobId>` |
| `object` | string | `platform.job.messages` |
| `created` | number | Unix timestamp |
| `messages` | array | עד 100 הודעות: `{ role, content, createdAt }` |

---

## 5. דוגמאות JSON

### 5.1 אירוע סטטוס (בזמן ריצה)

```json
{
  "id": "job-sync-job_abc123-1722528000",
  "object": "platform.job.status",
  "created": 1722528000,
  "status": "processing",
  "progress": 45,
  "error_code": null,
  "error_details": null
}
```

### 5.2 אירוע סטטוס סופי — שגיאה

```json
{
  "id": "job-sync-job_abc123-1722528600",
  "object": "platform.job.status",
  "created": 1722528600,
  "status": "error",
  "progress": 60,
  "error_code": "build_failed",
  "error_details": {
    "code": "build_failed",
    "category": "pipeline",
    "stage": "build",
    "message": "Build failed",
    "retryable": true,
    "recovery_hint": "Retry the task with dependencies reinstalled",
    "failedAt": "2026-08-02T10:00:00.000Z"
  }
}
```

### 5.3 אירוע ביטול

```json
{
  "id": "job-cancelled-job_abc123-1722529200",
  "object": "platform.job.cancelled",
  "created": 1722529200,
  "status": "stopped",
  "cancelled": true
}
```

### 5.4 אירוע diff (בסיום מוצלח)

```json
{
  "id": "job-diff-job_abc123",
  "object": "platform.job.diff",
  "created": 1722529800,
  "diff": {
    "base_ref": "main",
    "head_ref": "feat/my-change",
    "compare_url": "https://github.com/acme/widgets/compare/main...feat/my-change",
    "files": [
      {
        "filename": "src/index.ts",
        "status": "modified",
        "additions": 4,
        "deletions": 2,
        "changes": 6,
        "patch": "@@ -1,3 +1,5 @@\n+const a = 1",
        "language": "typescript",
        "is_binary": false,
        "previous_filename": null
      }
    ],
    "summary": { "files_changed": 1, "additions": 4, "deletions": 2 },
    "truncated": false,
    "generated_at": 1722529800
  }
}
```

### 5.5 אירוע הודעות + סיום

```json
{
  "id": "job-messages-job_abc123",
  "object": "platform.job.messages",
  "created": 1722529801,
  "messages": [
    { "role": "user", "content": "Implement feature X", "createdAt": "2026-08-02T09:50:00.000Z" },
    { "role": "assistant", "content": "Done", "createdAt": "2026-08-02T10:00:00.000Z" }
  ]
}
```

ואז:
```
data: {"done": true}

data: [DONE]

```

---

## 6. טיפול בשגיאות (Error Handling)

### 6.1 שגיאות HTTP (לפני פתיחת הזרם)

כל שגיאה חוזרת כתגובת JSON רגילה (לא SSE):

| סטטוס | תרחיש | body |
|-------|-------|------|
| `401` | חסר `Authorization` header | `{ "error": { "message": "Missing Authorization header", "type": "invalid_request_error" } }` |
| `401` | מפתח API לא חוקי | `{ "error": { "message": "Invalid API key", "type": "invalid_request_error" } }` |
| `404` | המשימה לא קיימת או לא שייכת למשתמש | `{ "error": { "message": "Job not found", "type": "invalid_request_error" } }` |
| `500` | שגיאה פנימית בלתי צפויה | `{ "error": { "message": "Internal server error", "type": "api_error" } }` |

### 6.2 שגיאות במהלך הזרימה

- **שגיאת polling פנימית** (DB כשל זמני): התקופה מודפסת ל-server-side, הזרם ממשיך לבדוק ב-poll הבא — ללא ניתוק.
- **משימה נמחקה באמצע:** הזרם נסגר עם `data: [DONE]`.
- **חריגה ממגבלת זמן (5 דקות):** הזרם נסגר עם `data: [DONE]` (רשת ביטחון `MAX_POLLING_DURATION`).
- **ניתוק לקוח:** הזרם מתנקה (`cancel()` → ניתוק ה-subscription מה-event-bus ועצירת ה-poll).

### 6.3 קוד שגיאה של המשימה (בתוך אירועי status)

כשהמשימה נכשלת, `error_code` ו-`error_details` ממולאים ב-**אירוע הסטטוס הטרמינלי** (לפני `messages`). כל הקודים מתועדים בטבלת ההפניות של [error-details-schema](./error-details-schema.md) ובנספח קודי השגיאה בדף היכולות.

---

## 7. דוגמת לקוח (Client Example)

```ts
// Node.js / fetch example — streaming
const res = await fetch('https://<host>/api/agent/v1/jobs/job_abc123/stream', {
  headers: { Authorization: `Bearer ${PLATFORM_API_KEY}` },
})

if (!res.ok) {
  const err = await res.json()
  throw new Error(err.error?.message || 'Stream failed')
}

const reader = res.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value, { stream: true })

  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const payload = line.slice(6)
    if (payload === '[DONE]') return
    const event = JSON.parse(payload)
    switch (event.object) {
      case 'platform.job.status':
        console.log(`status=${event.status} progress=${event.progress}`)
        break
      case 'platform.job.cancelled':
        console.log('Job was cancelled')
        return
      case 'platform.job.diff':
        console.log('Diff files:', event.diff.files.length)
        break
    }
  }
}
```

---

## 8. קבצים רלוונטיים

| קובץ | תפקיד |
|------|-------|
| `app/api/agent/v1/jobs/[jobId]/stream/route.ts` | ה-endpoint עצמו (לוגיקת SSE + event-bus + polling) |
| `lib/jobs/event-bus.ts` | pub/sub פנימי — `publishJobEvent` / `subscribeJob` |
| `app/api/agent/v1/jobs/[jobId]/cancel/route.ts` | פרסום אירוע `cancelled` ל-event-bus |
| `lib/api/job-diff.ts` | חישוב חוזה ה-JobDiff (`buildJobDiffForTask` + מטמון) |
| `lib/api/job-errors.ts` | סיווג `error_code` / `error_details` (`deriveErrorDetails`) |
| `docs/api/error-details-schema.md` | תיעוד מלא של מבנה השגיאות |
