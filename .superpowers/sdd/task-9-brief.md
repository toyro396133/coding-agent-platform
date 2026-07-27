### Task 9: Translate Auth Components (SignIn + SignOut)

**Files:**
- Modify: `components/auth/sign-in.tsx`
- Modify: `components/auth/sign-out.tsx`

**In `sign-in.tsx`:**
1. Add `useLocale()` import and hook
2. Replace:
- `'Sign in'` (button) → `t.auth.signIn`
- `'Sign in'` (dialog title) → `t.auth.signInTitle`
- `'Sign in with Password'` (dialog title) → `t.auth.signInPasswordTitle`
- `'Enter your username and password to sign in.'` → `t.auth.signInPasswordDesc`
- `'Choose how you want to sign in to continue.'` → `t.auth.signInDesc`
- `'Sign in with Vercel to continue.'` → `t.auth.signInVercelDesc`
- `'Sign in with GitHub to continue.'` → `t.auth.signInGitHubDesc`
- `'Sign in with Vercel'` (button) → `t.auth.signInWithVercel`
- `'Sign in with GitHub'` (button) → `t.auth.signInWithGitHub`
- `'Sign in with Password'` (button) → `t.auth.signInWithPassword`
- `'Loading...'` → `t.common.loading`
- `'Or'` → `t.common.or`
3. Replace `mr-2` with `me-2`

**In `sign-out.tsx`:**
1. Add `useLocale()` import and hook
2. Replace:
- `'You have been logged out.'` → `t.auth.youHaveBeenLoggedOut`
- `'API Keys'` → `t.auth.apiKeys`
- `'Sandboxes'` → `t.auth.sandboxes`
- `'Disconnect'` → `t.auth.disconnect`
- `'Connect'` → `t.auth.connect`
- `'Log Out'` → `t.auth.logOut`
- `'{remaining}/{total} messages remaining today'` → interpolate with `t.auth.messagesRemaining`
- Toast: `'GitHub disconnected'` → `t.auth.gitHubDisconnected`
- Toast: `'Failed to disconnect GitHub'` → `t.auth.failedToDisconnectGitHub`
3. Replace `mr-2` with `me-2`

4. Run `pnpm type-check` and fix any errors.

Report to: `.superpowers/sdd/task-9-report.md`
Return: status, commits, type-check results, concerns.
