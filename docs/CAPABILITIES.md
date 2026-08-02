# יכולות הפלטפורמה — מסמך רשמי (Capabilities)

> **תאריך עדכון אחרון:** 2 באוגוסט 2026
> **מסמך זה הוא "מקור האמת" הרשמי** לכל היכולות של הפלטפורמה. כל רעיון חדש או פיצ'ר שמומש חייב להתעדכן כאן באותו ה-PR/commit שבו הוא מומש.

---

## 📌 כללי עדכון חובה

1. **כל פיצ'ר חדש שמומש** — הוסף אותו לקטגוריה המתאימה למטה, עם פירוט טכני (קבצים, התנהגות, מגבלות).
2. **כל רעיון חדש** — הוסף אותו לסעיף "רעיונות בתכנון" בסוף המסמך, עם תיאור קצר.
3. **עדכן את תאריך העדכון** בראש המסמך.
4. **סנכרון עם דף האתר** — דף היכולות באתר (`/capabilities`) נטען מ-`lib/capabilities-data.ts` + `dictionaries`. אם הוספת פיצ'ר ל-UI, עדכן גם שם.

---

## תוכן עניינים

1. [סוכני AI (Agents)](#-1-סוכני-ai)
2. [ניתוב חכם (Smart Router)](#-2-ניתוב-חכם)
3. [אורכ'סטרטור (Orchestrator)](#-3-אורכ-סטרטור)
4. [צוותי עובדים (Worker Teams)](#-4-צוותי-עובדים)
5. [ארגז חול (Sandbox)](#-5-ארגז-חול)
6. [בדיקות חזותיות (Visual QA)](#-6-בדיקות-חזותיות)
7. [זיכרון ו-RAG](#-7-זיכרון-ו-rag)
8. [API חיצוני (External API)](#-8-api-חיצוני)
9. [גיט ו-GitHub](#-9-גיט-ו-github)
10. [אימות והתחברות (Authentication)](#-10-אימות-והתחברות)
11. [תור בקשות (Request Queue)](#-11-תור-בקשות)
12. [MCP ופלאגינים](#-12-mcp-ופלאגינים)
13. [תשתית (Infrastructure)](#-13-תשתית)
14. [ממשק משתמש (UI)](#-14-ממשק-משתמש)
15. [i18n — עברית ואנגלית](#-15-i18n)
16. [רעיונות בתכנון](#-רעיונות-בתכנון)

---

## 🤖 1. סוכני AI

### 1.1 ששת הסוכנים

| סוכן | ערך פנימי | סטטוס |
|------|-----------|-------|
| Claude (Anthropic) | `claude` | ✅ פעיל |
| Codex (OpenAI) | `codex` | ✅ פעיל |
| GitHub Copilot CLI | `copilot` | ✅ פעיל |
| Cursor CLI | `cursor` | ✅ פעיל |
| Gemini CLI (Google) | `gemini` | ✅ פעיל |
| opencode | `opencode` | ✅ פעיל |

**קובץ:** `lib/ai/model-definitions.ts` — `CODING_AGENTS` + `AGENT_MODELS`.

### 1.2 בחירת מודלים

- לכל סוכן רשימת מודלים מותאמת (למשל Claude: Sonnet 4.5, Opus 4.6, Haiku 4.5).
- **Compare Mode** — בחירת מספר מודלים במקביל; יוצרת משימה נפרדת לכל מודל ומשווה תוצאות.
- **BYOK (Bring Your Own Key)** — כל משתמש מגדיר מפתחות API פרטיים משלו דרך תפריט המשתמש.

### 1.3 פרטים טכניים

- הרצת CLI אמיתית בתוך ארגז החול (לא הדמיה) — `lib/sandbox/agents/*.ts`.
- גילוי אוטומטי של סוכן חסר מפתח → הודעה ברורה "API key required".
- Keep-Alive מאפשר המשך שיחה עם אותו ארגז חול לאחר סיום המשימה.

---

## 🧠 2. ניתוב חכם

| יכולת | תיאור | קובץ |
|-------|-------|------|
| ניתוב דו-שלבי | מילות מפתח + LLM לקבלת החלטה | `lib/ai/router.ts`, `lib/ai/smart-router.ts` |
| זיהוי טכנולוגיות | Stack detection אוטומטי | בתוך `router.ts` |
| חישוב מורכבות | Complexity scoring לבחירת רמת ביצוע | `router.ts` |
| מודלי גיבוי | Fallback דרך AI Gateway | `lib/ai/models.ts` |
| Retry עם backoff אקספוננציאלי | כולל jitter מלא ותמיכה ב-`Retry-After` | `lib/ai/retry.ts` |
| מעקב rate-limit + רוטציית מפתחות | `manager / rotator / tracker` | `lib/rate-limits/` |
| מטמון תוצאות (LRU + dedup) | מטמון תוצאות ראוטר | `lib/ai/router-cache.ts` |
| לוח מטריקות ניתוב | Dashboard חי של שימוש, עלויות ובריאות ספקים | `lib/ai/router-metrics.ts`, `components/routing-metrics-dashboard.tsx` |

**עקרון:** request חייב תמיד להצליח — מפתח שמיצה מכסה מתחלף אוטומטית, ומודל שנפל מתחלף במודל גיבוי.

---

## ⚙️ 3. אורכ'סטרטור

### 3.1 לולאת ביצוע

State Machine: **Analyze → Plan → Execute → Verify → Done** עם self-healing:
- בדיקת טיפוסים (TypeCheck)
- הרצת טסטים (RunTests)
- בדיקה חזותית (VisualCheck)
- לינט (LintCheck)
- כשלון → אבחון עצמי → תיקון אוטומטי (max retries)

**קבצים:** `lib/ai/orchestrator/loop.ts`, `state.ts`, `lib/ai/agent/index.ts`.

### 3.2 חבילות יכולות (Capability Packs) — 12 חבילות

| חבילה | כלים עיקריים |
|-------|---------------|
| `web` | webfetch, websearch |
| `plan` | createPlan (תכנון עם אישור אנושי) |
| `session` | checkpoint, restore, getHistory, fork |
| `background` | scheduleTask, monitorBackground, parallelMap |
| `research` | exploreRepository, findRelevantCode, readDocumentation |
| `file` | readFile, writeFile, editFile, glob, grep |
| `shell` | bash, monitor |
| `lsp` | goToDefinition, getHover, getCompletions |
| `browser` | browserNavigate, browserClick, browserFill, browserSnapshot, browserScreenshot |
| `visual-qa` | visualQaCritique, visualQaLoop |
| `repo-map` | generateRepoMap, getFileStructure |
| `queue` | listQueueRequests, editQueueRequest, reorderQueueRequest, mergeQueueRequests, deleteQueueRequest |

**קבצים:** `lib/ai/orchestrator/capabilities/*.ts`, `modes.ts` (רמות: basic / enhanced / auto).

### 3.3 יכולות נוספות

- **Task Queue פנימי** — ניהול משימות ברצף ובמקביל (`task-queue.ts`).
- **Human-in-the-loop** — תוכנית מאושרת על ידי המשתמש לפני ביצוע.
- **Project Rules** — בסגנון Cursor (`orchestrator/rules.ts`).
- **Plugins** — רישום וטעינת חבילות פלאגין (`runtime/plugin-registry.ts`).
- **Persistent Agents** — סוכנים רצים ברקע (`runtime/persistent-agent.ts`).
- **Checkpoints** — שמירה/שחזור/fork של מצב ביניים (`checkpoint-store.ts`).
- **Budget tracking** — מעקב steps/tokens/time/cost.

---

## 👥 4. צוותי עובדים

| יכולת | תיאור | קובץ |
|-------|-------|------|
| פריסת ארגזי חול מקבילים | צוות עובדים רץ במקביל | `worker/worker-manager.ts` |
| Auto-deploy לפי מורכבות | סוכן בונה צוות אוטומטית למשימות מורכבות | `worker/auto-deploy.ts` |
| CLI Runners מרובי סוכנים | Claude, Codex, Gemini, Cursor בתוך sandboxes | `worker/worker-manager.ts` |
| מיזוג patches | `git apply --3way` עם פתרון קונפליקטים | `worker/worker-manager.ts` |

**UI:** `components/worker-team-builder.tsx`, `components/worker-log-tabs.tsx`, `lib/db/schema.ts` (workerTeamConfig).

---

## 📦 5. ארגז חול

### 5.1 מחזור חיים מלא

1. Clone של הריפו + התקנת תלותים (`sandbox/creation.ts`)
2. הרצת הסוכן בתוך ארגז החול
3. Dev server אוטומטי ברקע (אם קיים)
4. אימות + push לענף (`sandbox/git.ts`)

### 5.2 Pipeline אימות 6-שלבי

| שלב | מה הוא עושה |
|-----|-------------|
| 1. Install | התקנת תלותים |
| 2. Build | בנייה |
| 3. TypeCheck | בדיקת טיפוסים |
| 4. Test | טסטים |
| 5. Lint | לינט |
| 6. Preview | תצוגה מקדימה |

**קובץ:** `lib/sandbox/pipeline.ts`. **Auto-fix loop:** `lib/sandbox/auto-fix.ts` — LLM מתקן את הקוד עד שהבדיקות עוברות.

### 5.3 יכולות נוספות

- **Package manager detection** — npm/pnpm/yarn/bun (`package-manager.ts`).
- **Port detection** — זיהוי פורט אוטומטי (`port-detection.ts`).
- **Cost estimation** — הערכת עלויות מראש (`cost-estimator.ts`).
- **Local execution** — הרצה מקומית (`local-execution.ts`).
- **Browser automation** — סוכן שולט בדפדפן בתוך הארגז.
- **Sandbox registry** — ניהול ארגזי חול (`sandbox-registry.ts`).
- **UI:** `sandbox-visualizer.tsx`, `sandboxes-dialog.tsx`, `pipeline-status.tsx`, `terminal.tsx`.

---

## 👁️ 6. בדיקות חזותיות

| יכולת | תיאור | קובץ |
|-------|-------|------|
| Browser tools (Playwright) | ניווט, קליק, מילוי טפסים, snapshot, צילום מסך | `capabilities/browser-tools.ts` |
| Visual QA Critique Loop | צילום מסך → מודל ראייה → ביקורת | `capabilities/visual-qa-tools.ts` |
| Auto Visual QA | ריצה אוטומטית אחרי כל שינוי UI + תיקון | `capabilities/auto-visual-qa.ts` |
| Visual QA Store | שמירת תוצאות (screenshot + verdict) | `capabilities/visual-qa-store.ts` |

**DB:** טבלת `visual_qa_runs` (`lib/db/migrations/0034_visual_qa_runs.sql`).
**UI:** `components/visual-qa-panel.tsx` — הצגת ריצות, צילומים וביקורות.

---

## 💾 7. זיכרון ו-RAG

| יכולת | תיאור | קובץ |
|-------|-------|------|
| מנוע embeddings (pgvector) | אינדוקס של קוד ושיחות | `memory/engine.ts` |
| שמירת זיכרון | `saveMemory` | `memory/engine.ts` |
| שליפת זיכרונות רלוונטיים | `retrieveRelevantMemories` | `memory/engine.ts` |
| חיפוש סמנטי בקוד | `semanticCodeSearch` | `orchestrator/indexer.ts` |
| סיכום שיחות | `summarize` | `memory/summarize.ts` |
| Parse של @mention | חיבור זיכרונות למשימות ואנשים | `memory/mention-parser.ts` |

---

## 🔌 8. API חיצוני

### 8.1 נקודות קצה

| Endpoint | פונקציה |
|----------|---------|
| `POST /api/agent/v1/chat/completions` | תאימות OpenAI (streaming + non-streaming) |
| `GET /api/agent/v1/jobs/[jobId]` | פרטי משימה — תיעוד מלא: [`docs/api/jobs-get.md`](../docs/api/jobs-get.md) |
| `GET /api/agent/v1/jobs/[jobId]/stream` | SSE בזמן אמת (event-bus) |
| `POST /api/agent/v1/jobs/[jobId]/cancel` | עצירת משימה + הריגת sandbox |

### 8.2 חוזה ה-SSE — `GET /api/agent/v1/jobs/[jobId]/stream`

הזרמת Server-Sent Events (SSE) בזמן אמת של מצב משימה, עם אימות `Bearer <PLATFORM_API_KEY>`.

**סוגי אירועים:**

| `object` | תיאור |
|----------|-------|
| `platform.job.status` | עדכון סטטוס/התקדמות (אירוע התחלתי + על כל שינוי) — כולל `error_code` ו-`error_details` |
| `platform.job.cancelled` | ביטול המשימה — מיידית דרך event-bus (מ-`POST .../cancel`) או גיבוי ב-polling |
| `platform.job.diff` | ה-patch המבני (חוזה JobDiff) — רק על `completed` |
| `platform.job.messages` | הודעות הסיכום (עד 100) לפני `done` |
| `{ done: true }` + `data: [DONE]` | סיום הזרם |
| `: ping` | Heartbeat כל 15 שניות |

**סדר הפליטה:** `status` (התחלתי) → `status` (עדכונים) → אירוע טרמינלי → (`diff` אם `completed` / `cancelled` אם `stopped`) → `messages` → `done` → `[DONE]` → סגירת הזרם.

**טיפול בשגיאות:** `401` (חסר/לא חוקי API key), `404` (Job not found), `500` (פנימי) — כג'ייסון לפני פתיחת הזרם. המשימה שנמחקה/חריגת 5 דקות → סגירה עם `[DONE]`.

**תיעוד מלא:** [`docs/api/job-stream-sse.md`](../docs/api/job-stream-sse.md) — כולל דוגמאות JSON לכל אירוע ודוגמת לקוח.

---

### 8.3 יכולות

- **API Key Management** — מפתחות פלטפורמה עם middleware אימות (`lib/auth/api-key.ts`, `platform-api-keys.tsx`).
- **Idempotency Keys** — כותרת `Idempotency-Key` → מניעת משימות כפולות (`deterministicTaskId`).
- **Real-time streaming** — pub/sub `lib/jobs/event-bus.ts` במקום polling.
- **Metrics** — `app/api/metrics/` + `lib/ai/router-metrics.ts`.
- **פורמט Diff/Patch מבני** — `GET /api/agent/v1/jobs/[jobId]` מחזיר ב-`platform_metadata.diff` חוזה JSON מחמיר: `files[]` (filename, status, additions, deletions, patch unified, language, is_binary), `summary`, `truncated`. לקוחות שכבר קיבלו את ה-patch דרך ה-SSE יכולים לדלג על החישוב (וקריאות ה-GitHub) עם `?include_diff=false` — אז `diff` הוא `null` ו-`diff_included` הוא `false` (ברירת מחדל `true`, תאימות לאחור).
- **מבנה שגיאות מפורט (Error details & codes)** — ב-`platform_metadata`: `error_code` מחזיר קוד שגיאה ספציפי (`build_failed`, `sandbox_timeout`, `auth_error`, `git_push_failed`, `rate_limited`, `cancelled`, `unknown_failure` ועוד) ו-`error_details` מחזיר מבנה מלא: `code`, `category`, `stage` (שלב ה-pipeline שנכשל), `message`, `retryable`, `recovery_hint`. הסיווג מתבסס על `task.error` + לוגי ה-pipeline (`lib/api/job-errors.ts` → `deriveErrorDetails`). `stopped` → `cancelled` תמיד.

    **קבצים:** `lib/api/job-diff.ts` (חישוב + מטמון TTL 5 דקות), `lib/api/job-errors.ts` (סיווג שגיאות), `lib/jobs/event-bus.ts` (pub/sub SSE), `lib/utils/file-language.ts` (זיהוי שפה/בינארי משותף), `lib/github/user-token.ts` (`getUserGitHubTokenByUserId`).

---

## 🧩 9. גיט ו-GitHub

| יכולת | תיאור | קובץ |
|-------|-------|------|
| שמות ענפים אוטומטיים | נוצרים ע"י AI | `lib/utils/branch-name-generator.ts` |
| הודעות commit | נוצרות ע"י AI (Conventional Commits) | `lib/utils/commit-message-generator.ts` |
| יצירת PR | דיאלוג + POST | `components/create-pr-dialog.tsx` |
| מיזוג PR | squash/merge/rebase + פתרון קונפליקטים ע"י סוכן | `components/merge-pr-dialog.tsx` |
| Revert commit | משימה אוטומטית ל-revert | `components/revert-commit-dialog.tsx` |
| דפדפן ריפו | טאבים: commits / issues / pull-requests | `app/repos/[...]`, `repo-layout.tsx` |
| Multi-repo | הרצת משימה על כמה ריפו בו-זמנית | `components/multi-repo-dialog.tsx` |
| חיבור/ניתוק GitHub | ניהול גישה | `app/api/auth/github/` |

**Git toolbar:** `components/git-toolbar.tsx`, **File browser/editor:** `file-browser.tsx`, `file-editor.tsx`, `file-diff-viewer.tsx`.

---

## 🔐 10. אימות והתחברות

| ספק | סטטוס |
|-----|-------|
| GitHub OAuth | ✅ פעיל (PKCE + state) |
| Google OAuth | ✅ פעיל (PKCE + state) |
| Discord OAuth | ✅ פעיל (PKCE + state) |
| Vercel OAuth | ✅ פעיל |
| סיסמה (credentials) | ✅ פעיל |

### פרטים טכניים

- Sessions מוצפנות ב-JWE (`lib/jwe/encrypt.ts`, `decrypt.ts`).
- **הצגת ספקים חכמה** — רק ספקים עם client ID מוגדר מוצגים (`lib/auth/providers.ts`).
- ביטול tokens ב-signout (GitHub/Google/Discord) — `app/api/auth/signout/route.ts`.
- Connect/Disconnect GitHub לכל משתמש שאינו GitHub — `components/auth/sign-out.tsx`.
- **מיזוג חשבונות בין ספקים (Cross-Provider Account Linking)** — קישור חשבונות מ-GitHub, Google, Discord ו-Vercel לפי דוא"ל מאומת:
  - `lib/db/merge-identity.ts` — `requestMerge()` יוצר token חד-פעמי (24h), `confirmMerge()` מוסיף ספק חדש לטבלת `accounts`.
  - `app/api/auth/merge/pending/confirm/reject` — API routes עם אימות בעלות (ownership check).
  - `components/merge-accounts-dialog.tsx` — דיאלוג המופיע אוטומטית במסך הראשי.
  - טבלת `merge_tokens` — `lib/db/schema.ts`.
  - ארבעת session creators (`create-google`, `create-discord`, `create-github`, `create`) קוראים ל-`requestMerge` אחרי `upsertUser`.
- Env vars מתועדים ב-`.env.example` וב-`README.md`.

---

## 📋 11. תור בקשות

| יכולת | תיאור | קובץ |
|-------|-------|------|
| הוספה לתור | הרצה מאוחרת לפי סדר | `lib/queue/engine.ts`, `dispatch.ts` |
| סידור מחדש | move up/down | `components/queue-panel.tsx` |
| מיזוג בקשות | merge נבחרות לבקשה אחת | `queue-tools.ts` |
| עריכה | שינוי כותרת/הנחיה | `queue-tools.ts` |
| מחיקה | הסרה | `queue-tools.ts` |
| Auto-dispatch | הרצת הבא בסדר אחרי סיום הנוכחי | `lib/queue/dispatch.ts` |

**DB:** טבלת `request_queue` (`0035_request_queue.sql`). **API:** `app/api/queue/`. **Events:** `queue-changed`.

---

## 🧰 12. MCP ופלאגינים

- **MCP Marketplace** — שוק שרתי MCP (`components/mcp-marketplace.tsx`, `lib/mcp/marketplace.ts`).
- **חיבור MCP Servers** — לכל סוכן, דרך טופס המשימה.
- **Plugin Manager** — ניהול פלאגינים (`components/plugin-manager.tsx`, `lib/plugins/types.ts`).
- **Plugin Registry** — טעינה דינמית של חבילות (`orchestrator/runtime/plugin-registry.ts`).

---

## 🏗️ 13. תשתית

| רכיב | תיאור |
|------|-------|
| Next.js 15 | App Router, React 19 |
| Neon Postgres | Drizzle ORM + migrations (`lib/db/`) |
| Vercel AI SDK | generateText, tool() |
| AI Gateway | ניתוב מודלים + observability |
| Vercel Sandbox | הרצה מבודדת בענן |
| Rate limits | `lib/rate-limits/` — מניעת ניצול |
| תאימות OpenAI | `app/api/agent/v1/` |

---

## 🎨 14. ממשק משתמש

- **Task Chat** עם Prompt Optimization, Auto-Remediate (`task-chat.tsx`).
- **לוגים בזמן אמת** (`logs-pane.tsx`, `worker-log-tabs.tsx`).
- **ניהול משימות** (יצירה, המשך, stop/restart, מחיקה, view all).
- **Cost estimation** (`cost-estimation.tsx`).
- **ריפו** — דפדפן, טאבים, PRs, issues, commits.
- **ניהול סנדבוקס** — רשימה, עצירה, ויזואליזציה.
- **API Keys** — `api-keys-dialog.tsx`, `platform-api-keys.tsx`.
- **Settings** — ניתוב סוכני משנה, שפה (`app/settings/`).

---

## 🌐 15. i18n

- **עברית (ברירת מחדל)** + **אנגלית** — `dictionaries/en.ts`, `dictionaries/he.ts`.
- RTL מלא (`html dir="rtl"`).
- מפתחות מאורגנים לפי קומפוננטה (`auth`, `taskForm`, `sidebar`, `queue`, `capabilities`...).
- **כלל:** טקסט חדש ב-UI חייב להוסיף מפתח גם ב-en וגם ב-he.

---

## 💡 רעיונות בתכנון

> רעיונות חדשים מתווספים כאן. כשמממשים רעיון — מעבירים אותו לקטגוריה המתאימה למעלה עם פירוט מלא.

| # | רעיון | סטטוס |
|---|-------|-------|
| 1 | Repo Map בסגנון Aider (קיים בסיסי — שיפור) | 🟡 מתוכנן |
| 2 | LSP Server מלא (tsserver process) | 🟡 חלקי |
| 3 | SWE-bench tuning | 🟡 מתוכנן |
| 4 | Debug Mode | 🟡 מתוכנן |
| 5 | Structured Rules Import | 🟡 מתוכנן |
| 6 | Image/Vision Support בתוך שיחות | 🟡 מתוכנן |
| 7 | תמיכת תמונות ב-Chat | 🟡 מתוכנן |
| 8 | MCP-Native Protocol | 🟡 מתוכנן |

---

*מסמך זה מתעדכן בכל שינוי. יש לסנכרן עם `lib/capabilities-data.ts` + `dictionaries` כדי שדף `/capabilities` באתר יישאר מעודכן.*
