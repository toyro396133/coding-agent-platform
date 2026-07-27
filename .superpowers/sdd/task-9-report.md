Task 9: Auth Components  
Status: ✅ Complete  
Modified: `components/auth/sign-in.tsx`, `components/auth/sign-out.tsx`  
Added `useLocale()` hooks and translation:  
- Sign-in: "Sign in" → `t.auth.signIn`, title/description → `t.auth.signInTitle/Desc`  
- Buttons: "Sign in with Vercel" → `t.auth.signInWithVercel`, etc.  
- Log-out: "You have been logged out." → `t.auth.youHaveBeenLoggedOut`  
- Dropdown: API Keys, Sandboxes, Disconnect, Connect, Log Out → dictionary keys  
- Toasts: "GitHub disconnected" → `t.auth.gitHubDisconnected`  
- All `mr-2` → `me-2`.  
**Type-check: No errors, pre-existing errors in `app-layout.tsx:221` unrelated.**  
