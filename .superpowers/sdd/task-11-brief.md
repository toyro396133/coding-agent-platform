### Task 11: Translate Settings Page

**Files:**
- Modify: `app/settings/page.tsx`

This is a Server Component. It needs to use `getDictionary` with the session locale (NOT `useLocale` which is for client components).

1. Add imports:
```typescript
import { getDictionary, type Locale } from '@/dictionaries'
import { getServerSession } from '@/lib/session/get-server-session'
```

2. At the start of the component:
```typescript
const session = await getServerSession()
const locale = (session?.user?.locale || 'he') as Locale
const t = getDictionary(locale)
```

3. Replace all strings with dictionary calls:
- `'Settings'` (metadata.title) → `t.settings.title`
- `'Settings'` (h2) → `t.settings.title`
- `'Manage your account settings and agent routing preferences.'` → `t.settings.description`
- `'General'` (tab) → `t.settings.general`
- `'Agent Routing'` (tab) → `t.settings.agentRouting`
- `'Users'` (tab) → `t.settings.users`
- `'General Settings'` (card title) → `t.settings.generalSettings`
- `'Configure basic platform settings.'` → `t.settings.generalDesc`
- `'Multi-Model Sub-Agent Routing'` → `t.settings.routingTitle`
- Routing description → `t.settings.routingDesc`
- `'Loading routes...'` → `t.common.loadingRoutes`
- `'Loading...'` → `t.common.loadingEllipsis`
- `'More settings coming soon.'` → `t.common.comingSoon`

4. Run `pnpm type-check` and fix any errors.

Report to: `.superpowers/sdd/task-11-report.md`
Return: status, commits, type-check results, concerns.
