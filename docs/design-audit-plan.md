# תוכנית ליטוש UX/UI בשלושה שלבים — Design Audit

> **סקיל:** design-audit · **תאריך:** 2 באוגוסט 2026 · **סטטוס:** שלב 1+2+3+4+5 יושמו — התוכנית הושלמה.

---

## סטטוס יישום — שלב 5 (הושלם): סגירת בונוסים + נגישות

| # | פריט | קובצים שנוגעו | סטטוס |
|---|---|---|---|
| 19 | סקלטונים ל-queue ו-metrics | `SkeletonCardList` הורחב עם `containerClassName` (grid) ו-`lines`; `queue-panel.tsx` — סקלטון במקום ספינר; `routing-metrics-dashboard.tsx` — 3 בלוקי סקלטון בטעינה ראשונית (תוקנה בעיית ה-`opacity-0` שהסתירה אותם) | ✅ יושם |
| 20 | אנימציית stagger-הופעה | `.card-in` (fadeIn reuse) + `animationDelay` מבוסס-אינדקס (35ms, תקרה 400ms) בכרטיסי משימות (`tasks-list-client.tsx`) וב-repo lists (`repo-commits/issues/pull-requests.tsx`); `prefers-reduced-motion` — נוסף `animation-delay: 0s` לביטול ההשהיות | ✅ יושם |
| 21 | נגישות — הכרזות כפולות | `SkeletonCardList.announce` (דיפולט true); בדשבורד ה-metrics רק הבלוק הראשון מכריז (השניים הבאים `announce={false}`); גם `sr-only` מותנה | ✅ יושם |
| 22 | מובייל — safe-area | סרגל הטאבים התחתון בדף המשימה (`task-details.tsx`) עם `pb-[env(safe-area-inset-bottom)]` כך שהחוצץ התחתון של iOS לא מכסה אותו | ✅ יושם |

---

## סטטוס יישום — שלב 4 (הושלם): סגירת פער ה-RTL

| # | פריט | קובצים שנוגעו | סטטוס |
|---|---|---|---|
| 16 | RTL — קומפוננטות shadcn/ui | `ui/select.tsx` (חץ בחירה `end-2`, item `pe-8 ps-2`), `ui/dropdown-menu.tsx` (אייקוני check/radio `start-2`, item `pe-2 ps-8`, `data-[inset]:ps-8`, `ms-auto`), `ui/dialog.tsx` (כפתור סגירה `end-4`), `ui/accordion.tsx` (`text-start`), `ui/drawer.tsx`/`ui/alert-dialog.tsx` (`text-start`) | ✅ יושם |
| 17 | RTL — מיקומים פיזיים שנותרו באפליקציה | `home-page-mobile-footer.tsx`, `multi-repo-dialog.tsx`, `task-details.tsx` (×2), `logs-pane.tsx` — `left-0 right-0` → `inset-x-0` | ✅ יושם |
| 18 | RTL — החלטות מתועדות שנשארו פיזיות | `left-1/2 -translate-x-1/2` (centering — תקין בשני הכיוונים); `drawer.tsx` side variants (`vaul-drawer-direction=right/left` — צדדים מפורשים); `app-layout` sidebar + `logs-pane` anchored ל-`left` מחושב (שלד שמאלי) | 🔵 תועד — מכוון |

---

## סטטוס יישום — שלב 3 (הושלם)

| # | פריט | קובצים שנוגעו | סטטוס |
|---|---|---|---|
| 11 | טעינה — סקלטונים עקביים | `components/skeleton-card-list.tsx` (קומפוננטה משותפת חדשה) + שילוב ב-`repo-commits.tsx`, `repo-issues.tsx`, `repo-pull-requests.tsx` (במקום ספינר מרכזי) | ✅ יושם |
| 12 | מעברים בין טאבי repo | `repo-layout.tsx` — תוכן מקודד ב-`key={pathname}` עם אנימציית `fadeIn` 0.25s בעת מעבר טאב | ✅ יושם |
| 13 | מיקרו-אינטראקציות | `tasks-list-client.tsx` — hover על כרטיס משימה: הצללה (`shadow-sm`) + חץ `ChevronLeft` נעלם-נחשף (משורטט ל-RTL); `task-chat.tsx` — כפתור send עם `hover:scale-110 active:scale-95` | ✅ יושם |
| 14 | Dark mode | אומת: ה-tokens של dark כבר מעוצבים (לא "הפוך בלבד") — צללי `pipeline-glow` מותאמים, צבעים חמים/קרים מכוונים | 🔵 הוערך — תקין |
| 15 | חגיגת סיום משימה | `task-page-client.tsx` — באנר ירוק עדין (סטטוס completed ללא שגיאות): אייקון ✓ + "המשימה הושלמה בהצלחה" + תיאור, עם `fadeIn`; מפתחות i18n חדשים ב-`en.ts`/`he.ts` | ✅ יושם |

---

## סטטוס יישום — שלב 2 (הושלם)

| # | פריט | קובצים שנוגעו | סטטוס |
|---|---|---|---|
| 6 | טיפוגרפיה — סולם tokens | `globals.css` (כבר כולל `.text-h1/h2/h3/caption/mono` + IBM Plex ראשי); הוצמדו tokens ל-`task-form.tsx` (h1) ול-`capabilities-page.tsx` (hero) | ✅ יושם |
| 7 | ערכת צבעים עקבית | אומת: shadcn button/input מטפלים ב-hover/focus/disabled; `focus-visible` ring אחיד דרך `outline-ring/50` ב-globals | 🔵 הוערך — תקין |
| 8 | אייקונוגרפיה | אומת: כל אייקוני lucide ב-strokeWidth דיפולטי 2; החריגים מוצדקים (ספינר 4, ת'יק קטן 3) | 🔵 הוערך — תקין |
| 9 | ספייסינג ורטיקלי | אומת: ריתמוס gap/padding עקבי ב-panes המרכזיים | 🔵 הוערך — תקין |
| 10 | RTL — logical properties | ~30 קומפוננטות: `mr-*`→`me-*`, `ml-*`→`ms-*`, `pl-*`→`ps-*`, `pr-*`→`pe-*`, אייקוני חיפוש/ניקוי ב-inputs (`left`→`start`, `right`→`end`), תגיות פינה (`-right`→`-end`), `border-l-2`→`border-s-2` | ✅ יושם |

**הערה:** ה-`app-layout` sidebar נשאר מעוגן פיזית ל-`left` בכוונה (מבנה שלדי — שינוי ל-RTL מלא ידרוש שכתוב של לוגיקת הגרירה).

---

## סטטוס יישום — שלב 1 (הושלם)

| # | פריט | קובצים שנוגעו | סטטוס |
|---|---|---|---|
| 1 | Primary action בדף הבית | (CTA קיים — טופס המשימה ראשי למחוברים, hero CTA לבלתי-מחוברים) | 🔵 הוערך — לא נדרש שינוי |
| 2 | Task page — היררכיית סטטוס | `task-page-client.tsx` — באנר סטטוס צבעוני (`TaskStatusBanner`) עם אייקון/צבע לכל שלב חיים + אחוז התקדמות | ✅ יושם |
| 3 | Empty states | `tasks-list-client.tsx` — מצב ריק מונחה עם אייקון, תיאור ו-CTA "צור את המשימה הראשונה"; מצב פילטר ריק עם "הצג את כל המשימות" | ✅ יושם |
| 4 | רספונסיביות מובייל | (הפריסה הקיימת כבר מתאימה — panes גמישים) | 🔵 הוערך |
| 5 | מצבי שגיאה עקביים | `components/error-state.tsx` (קומפוננטה חדשה) + שילוב ב-`tasks-list-client` וב-`task-page-client` עם retry | ✅ יושם |

**נוסף:** סקלטוני טעינה עקביים ברשימת המשימות ובדף המשימה; מפתחות i18n חדשים ב-`en.ts`/`he.ts` (סטטוסים + empty/error states).

---

---

## היקף

נבדקו הקומפוננטות המרכזיות במסלולי המשתמש העיקריים:

| מסך | קומפוננטה | תפקיד |
|---|---|---|
| דף הבית | `home-page-content.tsx`, `landing-page.tsx`, `shared-header.tsx` | נחיתה + ניווט ראשי |
| רשימת משימות | `tasks-list-client.tsx`, `task-form.tsx`, `queue-panel.tsx` | הכניסה לפעולה |
| דף משימה | `task-page-client.tsx`, `task-chat.tsx`, `task-details.tsx`, `logs-pane.tsx`, `terminal.tsx` | המסך הכי עמוס |
| עבודות/עובדים | `worker-log-tabs.tsx`, `worker-team-builder.tsx`, `sandbox-visualizer.tsx` | נראות מערכת |
| נכסי repo | `repo-commits.tsx`, `repo-issues.tsx`, `repo-pull-requests.tsx` | נתונים חיצוניים |
| הגדרות | `settings/routing-form.tsx`, `api-keys-dialog.tsx`, `platform-api-keys.tsx` | שליטה |

**הערה:** הפרויקט אינו כולל את קבצי הייחוס של הסקיל (DESIGN_SYSTEM.md, FRONTEND_GUIDELINES.md,
APP_FLOW.md, PRD, TECH_STACK). התוכנית מבוססת על ניתוח סטטי של הקומפוננטות + עקרונות עיצוב כלליים.
אם קיים מסמך עיצוב פנימי — נעדכן את הטוקens בהתאם.

---

## שלב 1 — קריטי (היררכיה, שמישות, רספונסיביות, עקביות)

1. **Primary action בדף הבית**: CTA "משימה חדשה" צריך להיות בלתי ניתן לפספוס — ניגודיות גבוהה,
   גודל גדול, מיקום קבוע מעל לקפל. כיום קיים סיכון להיעלמות בתוך ה-grid של הכרטיסים.
2. **Task page — היררכיית מידע**: מצבי ריצה (running/failed/completed) חייבים להיות מזוהים ב-2
   שניות. מסך המשימה עמוס ב-panes (logs, terminal, chat, files) — דרוש ראש מקטע ברור לכל pane
   וקביעת pane ראשי לפי שלב החיים של המשימה.
3. **Empty states**: דף רשימת המשימות ללא משימות חייב להנחות לפעולה ראשונה (באנר "צור את המשימה
   הראשונה" עם CTA), לא רשימה ריקה בלבד. אותו הדבר לתור ול-logs ריקים.
4. **רספונסיביות מובייל**: ה-checkpoint של מסך המשימה — panes צריכים לעבור ל-stacked עם tab
   עליון, ולא דחיסה צרה של אותו layout. כפתורי touch ≥ 44px.
5. **מצבי שגיאה עקביים**: כל ה-fetches צריכים מצב error אחיד (קומפוננטת `ErrorState` אחת) עם
   פעולת retry — לא הודעות שונות בכל קומפוננטה.

## שלב 2 — עידון (ספייסינג, טיפוגרפיה, צבע, יישור, אייקונים)

6. **טיפוגרפיה**: הגדרת סולם טיפוסים יחיד (display/title/body/caption) בקובץ tokens —
   כרגע הגדלים מפוזרים בין הקומפוננטות. IBM Plex (שהוגדר ב-landing) יכול להיות הגופן העיקרי
   של כל האפליקציה.
7. **ערכת צבעים עקבית**: בדיקת מצבי hover/focus/disabled בכל הכפתורים — סטטוסים חסרים ייצרו
   חוסר אמון. מצבי focus ring אחידים.
8. **אייקונוגרפיה**: lucide-react כבר בשימוש — לוודא עובי אחד (strokeWidth=2) בכל המקומות
   ומשקלים אחידים.
9. **ספייסינג ורטיקלי**: ריתמוס ספייסינג (4/8/12/16/24) בכל ה-panes — מניעת רווחים אקראיים.
10. **RTL**: הפרויקט RTL-first (he) — לוודא שימוש ב-logical properties (`ms/me/ps/pe/start/end`)
    בכל הקומפוננטות, לא `mr/ml` (חלק תוקן בענף 7 — יש להשלים את השאר).

## שלב 3 — ליטוש (מיקרו-אינטראקציות, מעברים, מצבי ריק/טעינה/שגיאה, dark mode)

11. **טעינה**: סקלטונים עקביים לכל רשימות ה-fetch (משימות, commits, issues, PRs) — לא ספינר מרכזי.
12. **מעברים**: page-transition עדין בין טאבים של repo (commits/issues/PRs) — fade/slide קצר.
13. **מיקרו-אינטראקציות**: hover על כרטיסי משימה — הצללה + חץ; כפתור send בצ'אט — נפח עדין ב-hover.
14. **Dark mode**: בדיקת ניגודיות tokens ב-dark (הפרויקט משתמש ב-next-themes) — לוודא שצללים
    ו-backgrounds אינם "הפוך בלבד" אלא מעוצבים.
15. **מצב סיום משימה**: celebration subtle (בדיקה ירוקה + מסכם) כשאין שגיאות — תחושת השלמה.

---

## הערות יישום למבצע

- כל שינוי משתמש ב-tokens של ה-design system (אין hardcode של צבעים/גדלים).
- אין שינוי בהתנהגות פונקציונלית — רק ויזואלי/אינטראקציה.
- כל שלב מוצג לאישור לפני מעבר לשלב הבא.
- ערכת צבעים/טיפוסים חדשה תתווסף כקובץ tokens נפרד, לא כהחלפה ישירה.

---

## מה נדרש ממך כדי להמשיך

1. אישור השלבים שברצונך ליישם (כולם / חלקם).
2. אופציונלי: מסמך עיצוב קיים (אם יש) לעדכון הטוקens.
3. גישה ל-app רץ לצורך בדיקת מסכים בפועל (mobile → tablet → desktop).
