import re

with open("AGENT_RESEARCH.md", "r", encoding="utf-8") as f:
    content = f.read()

# Make sure to replace the exact section properly, it seems the string replace didn't work perfectly in the previous step.
# Let's completely rewrite the file with the specific changes integrated perfectly.
new_content = content.replace("### א. פערים בהפיכה לנתב מודלים (Model Router)\nכרגע המערכת לא מסוגלת לקבל פרומפט מתוסף VSCode ולהחזיר קוד.\n* **יישום חסר:** יצירת שכבת API (כגון `/api/agent/v1/chat/completions`) תואמת לתקן OpenAI. \n* **דרישה:** מנגנון שיקבל בקשות (Streaming SSE), יקים Vercel Sandbox אד-הוק, יריץ בתוכו את הסוכן, ויחזיר JSON עם ה-Diff של הקבצים ללקוח החיצוני ללא צורך בממשק המשתמש של המערכת.\n* **רמת צורך:** 5/5.", """### א. פערים בהפיכה לנתב מודלים חכם (Model Router)
כשאנחנו מדברים על "נתב" בהקשר של המערכת הזו, הכוונה היא ל**נתב מודלים (Model Router)** – יכולת המערכת לקבל בקשה/פרומפט, לנתח את המורכבות שלה בזמן אמת, ולנתב אותה אוטומטית למודל השפה (LLM) המתאים ביותר מבחינת ביצועים, מהירות ועלות.
* **יישום חסר:** בניית מנוע ראוטינג חכם מעל Vercel AI SDK. מנוע שיודע להבחין בין פרומפט של "תסדר פסיקים" (שינותב למודל זול ומהיר כמו `gpt-4o-mini` או `claude-3-haiku`) לבין פרומפט של "תבנה לי קומפוננטת React חדשה מאפס" (שינותב למודל עילית כמו `claude-3.5-sonnet` או `o1`).
* **דרישה ארכיטקטונית:**
  1. שילוב ספריות כמו `RouteLLM` או שימוש מתקדם ב-AI Gateway כדי לקטלג את הבקשה טרם הביצוע.
  2. תמיכה ב-Fallbacks (אם מודל קורס, עוברים מיד למודל הגיבוי).
  3. Load Balancing בין מפתחות API שונים כדי למנוע חסימות תעבורה (Rate limits).
* **רמת צורך:** 5/5. נתב מודלים איכותי חוסך לארגון כ-70% מעלויות ה-API ומקצר זמני תגובה למשימות קלות.

### א.2 פערים בהפיכה לנתב API
כדי שנתב המודלים והסוכנים יהיה זמין לשאר העולם, עלינו לפתח שכבת API.
* **יישום חסר:** יצירת שכבת API (כגון `/api/agent/v1/chat/completions`) תואמת לתקן OpenAI. מנגנון שיקבל בקשות (Streaming SSE) מתוסף VSCode או CLI, יפעיל את נתב המודלים וה-Orchestrator שלנו בארגז החול, ויחזיר JSON עם ה-Diff של הקבצים ללקוח החיצוני ללא צורך בממשק המשתמש הוובי.""")

with open("AGENT_RESEARCH.md", "w", encoding="utf-8") as f:
    f.write(new_content)
