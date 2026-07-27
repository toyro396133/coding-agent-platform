Task 13: Dialog Components  
Status: ✅ Complete  
Modified: `components/api-keys-dialog.tsx`, `components/sandboxes-dialog.tsx`, `components/multi-repo-dialog.tsx`, `components/open-repo-url-dialog.tsx`  
Added `useLocale()` hooks and translation for all existing dialog components:  
- API Keys: title/description → `t.dialogs.apiKeys.title/description`, etc.  
- Sandboxes: title/description → `t.dialogs.sandboxes.title/description`, etc.  

- Missing dialog components: `create-pr-dialog.tsx`, `merge-pr-dialog.tsx`, `revert-commit-dialog.tsx` (did not exist in codebase)  
**Type-check: No errors.**  
