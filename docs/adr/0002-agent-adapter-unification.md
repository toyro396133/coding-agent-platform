# ADR-0002 — איחוד אדפטר הרצת הסוכנים בארגז החול

**סטטוס:** מוצע · **תאריך:** 2 באוגוסט 2026 · **קשור ל:** מועמד 2 בדוח האדריכלות

## הקשר (Context)

הידע של "איך מריצים סוכן CLI (claude/codex/cursor/gemini) בתוך ארגז חול" קיים בשני מקומות:

1. `lib/sandbox/agents/*` — `executeAgentInSandbox` + המתקינים/הקונפיגים הספציפיים לסוכן.
2. `lib/ai/orchestrator/worker/worker-manager.ts` — פונקציות `runClaudeWorker`, `runCursorWorker`,
   `runCodexWorker`, `runGeminiWorker`, `runGenericWorker` שמשכפלות את אותו ידע (env vars,
   config.toml ל-codex, התקנת CLI).

על פי העיקרון "one adapter = hypothetical seam, two = real" — שני מימושים מקבילים הם שכפול אמיתי.

## החלטה (Decision)

1. **האדפטר חי במקום אחד**: `lib/sandbox/agents/` מחזיק את כל הידע על הרצת סוכן בארגז חול,
   כולל גרסת worker (`worker-runner.ts` שמרכז את חמש פונקציות ה-`run*Worker`).
2. **`worker-manager.ts` הופך לדק**: אחריותו היחידה היא מחזור חיים — יצירת ארגז, clone, git config,
   קריאה לאדפטר, חילוץ diff, מיזוג patches.
3. **בנאים משותפים**: `buildCodexConfigToml` יוצא מ-`codex.ts` ומשמש גם את מסלול ה-main וגם את ה-worker
   (חיסול שכפול הקונפיג).

## השלכות (Consequences)

- **טוב:** שינוי בהתקנה/קונפיג של סוכן נוגע במקום אחד; בדיקות אפשריות נגד האדפטר בלבד.
- **רע:** קבצי ה-agent מקבלים אחריות נוספת (גרסת worker) — מפוצה במבנה פנימי ברור.
- **סיכון:** נמוך — תנועה מכנית של פונקציות קיימות בלי שינוי התנהגות.

## חלופות שנשקלו

- השארת השכפול (נדחה: כל תיקון מוכפל, וסטיות בין המימושים הן באגים נסתרים).
- העברת worker-runner לתוך worker-manager (נדחה: מחזיר את ידע ההרצה למקום הלא נכון).
