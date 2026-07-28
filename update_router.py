# -*- coding: utf-8 -*-
import os

with open("AGENT_RESEARCH.md", "r", encoding="utf-8") as f:
    content = f.read()

# Replace API Router with Model Router where appropriate, keeping API Router if it means exposing endpoints
content = content.replace("נתב API (API Router)", "נתב מודלים (Model Router)")
content = content.replace("פערים בהפיכה לנתב API (API Router)", "פערים בהפיכה לנתב מודלים חכם (Model Router)")

# Insert Dynamic Model Routing info into the matrix
matrix_replacement = """| **API Router (חשיפת הסוכן החוצה ב-REST)** | ❌ סגור | ❌ סגור | ✅ (מודלי שפה נקיים)| ❌ סגור | ❌ חסר |
| **Model Routing (נתב מודלים אוטומטי)** | ❌ סגור | ✅ מנותב בשרת | ❌ לא | ❌ לא | ✅ מתהווה (AI Gateway) |"""

content = content.replace("| **API Router (חשיפת הסוכן החוצה ב-REST)** | ❌ סגור | ❌ סגור | ✅ (מודלי שפה נקיים)| ❌ סגור | ❌ חסר |", matrix_replacement)

# Update the specific missing capability section for Model Router
router_gap_replacement = """### א. פערים בהפיכה לנתב מודלים חכם (Model Router)
כשאנחנו מדברים על "נתב" בהקשר של המערכת הזו, הכוונה היא ל**נתב מודלים (Model Router)** – יכולת המערכת לקבל בקשה/פרומפט, לנתח את המורכבות שלה בזמן אמת, ולנתב אותה אוטומטית למודל השפה (LLM) המתאים ביותר מבחינת ביצועים, מהירות ועלות.
* **יישום חסר:** בניית מנוע ראוטינג חכם מעל Vercel AI SDK. מנוע שיודע להבחין בין פרומפט של "תסדר פסיקים" (שינותב למודל זול ומהיר כמו `gpt-4o-mini` או `claude-3-haiku`) לבין פרומפט של "תבנה לי קומפוננטת React חדשה מאפס" (שינותב למודל עילית כמו `claude-3.5-sonnet` או `o1`).
* **דרישה ארכיטקטונית:**
  1. שילוב ספריות כמו `RouteLLM` או שימוש מתקדם ב-AI Gateway כדי לקטלג את הבקשה טרם הביצוע.
  2. תמיכה ב-Fallbacks (אם מודל קורס, עוברים מיד למודל הגיבוי).
  3. Load Balancing בין מפתחות API שונים כדי למנוע חסימות תעבורה (Rate limits).
* **רמת צורך:** 5/5. נתב מודלים איכותי חוסך לארגון כ-70% מעלויות ה-API ומקצר זמני תגובה למשימות קלות.

### א.2 פערים בהפיכה לנתב API
כדי שנתב המודלים והסוכנים יהיה זמין לשאר העולם, עלינו לפתח שכבת API.
* **יישום חסר:** יצירת שכבת API (כגון `/api/agent/v1/chat/completions`) תואמת לתקן OpenAI. מנגנון שיקבל בקשות (Streaming SSE) מתוסף VSCode או CLI, יפעיל את נתב המודלים וה-Orchestrator שלנו בארגז החול, ויחזיר JSON עם ה-Diff של הקבצים ללקוח החיצוני ללא צורך בממשק המשתמש הוובי.
"""

# Find the start of the old section and replace it
start_idx = content.find("### א. פערים בהפיכה לנתב API (API Router)")
end_idx = content.find("### ב. פערים כסוכן עצמאי")

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + router_gap_replacement + content[end_idx:]

with open("AGENT_RESEARCH.md", "w", encoding="utf-8") as f:
    f.write(content)
