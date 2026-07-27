# Hebrew Localization Design

## Overview

Full Hebrew (RTL) localization of the Coding Agent Template UI, with user-based locale preference stored in the database.

## Architecture

### Dictionary Structure

Separate files per language with hierarchical keys organized by domain:

- `dictionaries/en.ts` - All English strings
- `dictionaries/he.ts` - All Hebrew translations  
- `dictionaries/index.ts` - Type definitions, re-exports, `getDictionary()` helper

Domains: `common`, `home`, `taskForm`, `sidebar`, `taskDetails`, `taskChat`, `settings`, `auth`, `repos`, `dialogs`, `errors`, `toasts`

### Locale Flow

```
DB (users.locale) → Server Session → RootLayout → LocaleProvider → Jotai localeAtom → useLocale() hook
```

Server Components: use `getDictionary(session.user.locale)` directly from the session.

### Key Components

1. **`components/providers/locale-provider.tsx`** - LocaleProvider wraps the app, initializes Jotai atom from server session, provides `useLocale()` hook with `{ t, locale, setLocale }`

2. **`dictionaries/en.ts` + `dictionaries/he.ts`** - Comprehensive translation files organized by domain

3. **Database** - Add `locale text('locale').default('he').notNull()` to `users` table in `lib/db/schema.ts`

4. **API** - `PATCH /api/user/locale` endpoint to update locale preference

5. **`components/locale-toggle.tsx`** - Language switcher in user dropdown menu (alongside ThemeToggle)

6. **Session** - Include `locale` in `SessionUserInfo` type (`lib/session/types.ts`)

### RTL Adjustments

Replace directional CSS classes:
- `mr-*` / `ml-*` → `me-*` / `ms-*`
- `right-*` / `left-*` → `start-*` / `end-*`
- `-translate-x-*` → use `-translate-x-*` with RTL-aware transforms

## Translation Coverage

Every user-facing string in every component will be mapped to a dictionary key:

| Domain | Components |
|--------|-----------|
| common | Cross-component strings (loading, save, cancel, search, etc.) |
| home | home-page-content.tsx, shared-header.tsx |
| taskForm | task-form.tsx (placeholders, labels, tooltips, options) |
| sidebar | task-sidebar.tsx, app-layout.tsx (tabs, buttons, empty states) |
| taskDetails | task-details.tsx (all pane headers, tab labels, buttons) |
| taskChat | task-chat.tsx (input, actions, statuses) |
| settings | settings/page.tsx, routing-form.tsx |
| auth | sign-in.tsx, sign-out.tsx, sign-in-password.tsx |
| repos | repo-layout.tsx, repo-commits.tsx, repo-issues.tsx, repo-pull-requests.tsx |
| dialogs | api-keys-dialog.tsx, sandboxes-dialog.tsx, create-pr-dialog.tsx, merge-pr-dialog.tsx, revert-commit-dialog.tsx, multi-repo-dialog.tsx, open-repo-url-dialog.tsx |
| errors | Error messages and fallback text |
| toasts | Toast notification messages |

## Files Changed

| File | Change |
|------|--------|
| `dictionaries/en.ts` | New - complete English dictionary |
| `dictionaries/he.ts` | New - complete Hebrew dictionary |
| `dictionaries/index.ts` | Rewrite - re-export, add Locale type, getDictionary |
| `lib/db/schema.ts` | Add `locale` column to `users` table |
| `lib/db/users.ts` | Handle locale field in user queries |
| `lib/session/types.ts` | Add `locale` to User/Session types |
| `lib/session/*` | Include locale in session data |
| `app/api/user/locale/route.ts` | New - PATCH endpoint for locale updates |
| `components/providers/locale-provider.tsx` | New - LocaleProvider + useLocale hook |
| `components/locale-toggle.tsx` | New - language switcher component |
| `components/auth/sign-out.tsx` | Add LocaleToggle to dropdown menu |
| `app/layout.tsx` | Wrap with LocaleProvider |
| All components | Replace inline strings with `t()` calls |
