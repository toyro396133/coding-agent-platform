# ADR-0003 — סכמות Zod נשארות כתובות ידנית (לא נוצר מ-drizzle-zod)

**סטטוס:** התקבל · **תאריך:** 2 באוגוסט 2026 · **קשור ל:** מועמד 4 בדוח האדריכלות

## הקשר (Context)

מועמד 4 הציע להפיק את סכמות ה-Zod (insert/select) מהגדרת הטבלאות של Drizzle באמצעות
`drizzle-zod`, כדי שסכמות לעולם לא יסחפו מהעמודות. נבדק על הטבלאות הבטוחות ביותר
(`visualQaRuns`, `requestQueue`) בשמירת שמות הייצוא זהים.

## בעיה (Problem)

**התקנת `drizzle-zod` שוברת את כל האפליקציה בזמן ריצה**, בכל הגרסאות:

- `drizzle-zod` מייבא את `getViewSelectedFields` מ-`drizzle-orm` ברמת המודול.
- `getViewSelectedFields` אינו קיים ב-`drizzle-orm@0.36.4` — הגרסה מקובעת בפרויקט.
- נבדקו `0.8.3`, `0.7.0` ו-`0.6.1` — כולן מייבאות את הפונקציה חסרה.
- תוצאת הריצה: `SyntaxError: The requested module 'drizzle-orm' does not provide an export named 'getViewSelectedFields'`
  — כל ייבוא של `lib/db/schema.ts` קורס (כולל בדיקות).

המרווח שהוכרז ב-peerDependencies (`drizzle-orm >=0.36.0`) מטעה — בפועל נדרשת גרסת drizzle-orm חדשה יותר.

## החלטה (Decision)

1. **לא מאמצים את `drizzle-zod` כעת.** סכמות ה-Zod נשארות כתובות ידנית ליד כל טבלה.
2. **התלות הוסרה** מ-`package.json`; `lib/db/schema.ts` חזר למצב המקורי ללא שינוי.
3. **שדרוג `drizzle-orm` הוא תנאי מוקדם** אם רוצים לחזור לרעיון (שדרוג טבלאות Drizzle
   משפיע על migrations/snapshots — שינוי נפרד עם סיכון משלו).

## השלכות (Consequences)

- **טוב:** אפס סיכון; מצב ה-schema נשאר יציב ומעובד.
- **רע:** הסיכון הקיים של סחיפה בין עמודות לסכמות לא טופל.
- **צעד עתידי אפשרי:** בפרויקט עם `drizzle-orm` מעודכן, להפיק סכמות אוטומטית
  ולאמת בעזרת בדיקה שהן שוות-ערך לידניות (diff test) לפני החלפה.

## חלופות שנשקלו

- הורדת גרסה (`0.6.1`/`0.7.0`): נדחתה — גם הן דורשות את `getViewSelectedFields`.
- שדרוג `drizzle-orm` עכשיו: נדחה — שינוי גדול שמשפיע על כל ה-migrations, לא מוצדק עבור רווח קוסמטי.
