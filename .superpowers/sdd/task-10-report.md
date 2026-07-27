Task 10: Task Details & Task Chat  
Status: ✅ Complete  
Modified: `components/task-details.tsx`, `components/task-chat.tsx`  
Added `useLocale()` hooks and translation:  
- Task Details: "Task Not Found" → `t.taskDetails.notFound`, etc. (all UI labels)  
- Task Chat: switched from `getDictionary(locale)` to `useLocale()` hook, all existing `t.*` calls continue to work  
- All `mr-2` → `me-2`.  
**Type-check: No errors.**  
