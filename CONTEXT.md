# CONTEXT.md — גלוסר הדומיין של הפלטפורמה

> מסמך זה מגדיר את **שפת הדומיין** של Coding Agent Platform. כל מודול, סוכן עתידי ו-ADR
> חייבים להשתמש במונחים האלה במדויק — ולא להמציא שמות מקבילים ("מודול", "שירות", "גבול").
>
> **עדכון אחרון:** 2 באוגוסט 2026

---

## המונחים המרכזיים

### משימה (Task)
יחידת העבודה הבסיסית בפלטפורמה. נוצרת על ידי המשתמש (או על ידי סוכן כתת-משימה) ומתבצעת
דרך **מסלול ביצוע** — אורכ'סטרטור או סוכן חיצוני. יש לה מחזור חיים: `pending → processing → completed | error | stopped | PLANNING_PENDING_APPROVAL`.

- טבלה: `tasks` (lib/db/schema.ts)
- מודולים: `lib/ai/orchestrator/loop.ts`, `lib/sandbox/pipeline.ts`, `app/api/tasks/*`

### מסלול ביצוע (Execution Path)
האופן שבו משימה רצה בפועל. שני מסלולים עיקריים:

1. **אורכ'סטרטור** (`runOrchestrator`) — מסלול פנימי עם כלים, צוות עובדים ואוטונומיה.
2. **סוכן חיצוני** (`executeAgentInSandbox`) — הרצת CLI של סוכן (claude/codex/cursor/…) בתוך ארגז חול.

הבחירה נקבעת דרך `executionMode` על המשימה (`orchestrator_external`, `orchestrator_only`, `external_only`).

### עובד (Worker)
סוכן CLI שרץ בארגז חול ייעודי **משלו**, כחלק מ**צוות עובדים**. כל עובד מקבל ספק
(`workerSpec`) ומחזיר תוצאה (`WorkerResult`) עם `gitPatch` שממוזג לתוך הארגז הראשי.

- מודולים: `lib/ai/orchestrator/worker/worker-manager.ts`, `lib/sandbox/agents/*`
- מונח קרוב: **אדפטר סוכנים** — המודול שיודע להריץ כל CLI בתוך ארגז חול.

### תור (Queue)
שני תורים נפרדים — אין לבלבל:

1. **תור המשתמשים** (`request_queue`) — בקשות שממתינות לריצה סדרתית אחת-אחת. מוגדר ב-`lib/queue/engine.ts`.
2. **רשימת המשימות הפנימית של הסוכן** (`task-queue.ts`) — תת-משימות שהאורכ'סטרטור מנהל ככלים (`listTasks`, `createTask`…).

### ארגז חול (Sandbox)
מכונת וירטואליה חד-פעמית של Vercel שבה מתבצעת העבודה. יש ארגז ראשי למשימה, וארגז לכל עובד.
- מודול: `lib/sandbox/sandbox-registry.ts`, `lib/sandbox/commands.ts`

### אוטונומיה (Autonomy Level)
רמת השליטה של הסוכן בפלטפורמה עצמה: `guided` (מחכה לאישור תוכנית), `autonomous` (ביצוע חופשי),
`full` (שליטה מלאה + כלי system-control). מוגדר ב-`lib/ai/orchestrator/capabilities/types.ts`.

### יכולת (Capability Level)
רמת הכלים שהאורכ'סטרטור מקבל: `basic`, `enhanced`, `auto`. חבילות כלים נטענות לפי רמה
ב-`lib/ai/orchestrator/capabilities/index.ts`.

### Router (נתב מודלים)
המודול שבוחר איזה מודל יריץ משימה. שתי אסטרטגיות: **heuristic** (מילות מפתח) ו-**LLM** (ניתוח מורכבות).
- מודולים: `lib/ai/router.ts`, `lib/ai/smart-router.ts`
- **החלטה אדריכלית: אוחדו למודול אחד** — ראו `docs/adr/0001-router-unification.md`.

### קטלוג מודלים (Model Registry)
מקור האמת היחיד לשמות מודלים, ספקים, מחירים ו-tiers. צורכים אותו: cost-estimator, rate-limits, router.
- מודול: `lib/ai/model-registry.ts`

---

## עקרונות אדריכליים שנקבעו

1. **אדפטר יחיד לכל פעולה חיצונית** — "one adapter = hypothetical seam, two = real".
   הרצת סוכן בארגז חול מתבצעת במקום אחד (`lib/sandbox/agents/`).
2. **מבחן המחיקה** — לפני יצירת מודול חדש, נשאל: האם מחיקת המודול תרכז מורכבות או רק תזיז אותה?
3. **לוגים סטטיים בלבד** — אסור להכניס ערכים דינמיים ללוגים (ראה AGENTS.md).

---

## מונחים שעדיין מטושטשים (יש לחדד)

- "מודל" לעומת "סוכן": מודל = שם ה-LLM; סוכן = CLI שמריץ את המודל בתוך ארגז חול.
- "שלב" (pipeline stage) מול "צעד" (orchestrator step): שלב = יחידת pipeline; צעד = iteration בלולאת האורכ'סטרטור.
