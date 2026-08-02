# ADR-0001 — איחוד הנתב (Router Unification)

**סטטוס:** מוצע · **תאריך:** 2 באוגוסט 2026 · **קשור ל:** מועמד 1 בדוח האדריכלות

## הקשר (Context)

בפלטפורמה קיימים שני מודולים שקוראים לאותו שם — `routePrompt`:

- `lib/ai/router.ts` — סינכרוני, מבוסס מילות מפתח (heuristic), מחזיר `RoutingResult` עם מודלים עדכניים.
- `lib/ai/smart-router.ts` — אסינכרוני, מבוסס ניתוח LLM, מחזיר `RoutingDecision` עם שמות מודלים מיושנים
  (למשל `claude-3-5-sonnet-20241022`).

הקוראים בוחרים בגורל: `app/api/tasks/route.ts` משתמש ב-smart-router, בעוד
`loop.ts`, `pipeline.ts` ו-`auto-deploy.ts` משתמשים ב-router.ts. קטלוג המודלים מוגדר גם
ב-`cost-estimator.ts` (מחירים), ב-`rate-limits/types.ts` (ספקים) וב-`model-definitions.ts`.

## החלטה (Decision)

1. **מודול אחד לעניין אחד**: החלטת ה-routing חיה ב-`lib/ai/router.ts` בלבד. `smart-router.ts`
   משנה את השם ל-`routePromptWithLLM` (אסטרטגיית ה-LLM) ואינו קורא יותר `routePrompt`.
2. **Model Registry אחד**: `lib/ai/model-registry.ts` הוא מקור האמת היחיד לשמות מודלים → ספק,
   מחיר ו-tier. `cost-estimator.ts` ו-`rate-limits/types.ts` מייבאים ממנו במקום להגדיר מחדש.
3. **שפות דוגמנות אחידות**: אין יותר שני שמות למודל אחד; מודלים מיושנים מתעדכנים לשמות העדכניים
   (`claude-sonnet-4-5` במקום `claude-3-5-sonnet-20241022`).

## השלכות (Consequences)

- **טוב:** שינוי קטלוג (הוספת מודל/עדכון מחיר) נוגע במקום אחד; שפת הדומיין אחידה; בדיקות routing
  אפשריות על registry בלבד.
- **רע:** קוראים קיימים של `smart-router` צריכים עדכון ייבוא (מקרה אחד: `tasks/route.ts`).
- **סיכון:** שינוי שמות מודלים יכול להשפיע על בחירת מודלים בפועל — ממוסגר ומתועד.

## חלופות שנשקלו

- השארת שני המודולים (נדחה: שכפול ידע וסתירת שמות).
- מיזוג מלא לקובץ אחד (נדחה כרגע: נפח גדול מדי; מועדף שלב-שלב עם registry משותף).
