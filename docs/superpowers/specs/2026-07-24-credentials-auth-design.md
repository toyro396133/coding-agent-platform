# Credentials (Username/Password) Authentication

## Overview

Add username + password login as an additional authentication method alongside existing OAuth providers (GitHub, Vercel). Accounts can use both OAuth and password interchangeably.

## Database Changes

### users table
- Add `'credentials'` to `provider` enum (currently `['github', 'vercel']`)
- Add `password_hash` column (`text`, nullable)

For credential users: `provider='credentials'`, `externalId` = username (as unique identifier).
For OAuth users who also get a password set: just `password_hash` is added to their existing row.

## Session Management

Reuse the existing JWE cookie mechanism (`_user_session_` cookie):
- `encryptJWE`/`decryptJWE` for session serialization
- `saveSession` for setting the cookie
- `getSessionFromCookie` for reading it server-side

Add `'credentials'` to the `authProvider` union type.

## API Routes

### `POST /api/auth/signin/credentials`
- Accept `{ username, password }`
- Validate with zod
- Look up user by username (check `username` column, regardless of provider)
- Verify password against `password_hash` using bcrypt
- Create session via `saveSession` (same as OAuth)
- Return `{ success: true }` with Set-Cookie header

### `POST /api/auth/admin/users`
- Requires existing authenticated session (any provider)
- Accept `{ username, password, email?, name?, userId? }`
- If `userId` is provided: update existing user's password_hash (add/reset password for OAuth user)
- If no `userId`: create new user with `provider='credentials'`, `externalId=<username>`, `password_hash`
- Hash password with bcrypt (cost factor 10)
- Return created/updated user info (without password_hash)

### `GET /api/auth/admin/users`
- Requires existing authenticated session
- Return list of all users (id, username, email, provider, createdAt — no tokens/hashes)

## Admin UI

Add "Users" tab to the existing `/settings` page (`Tabs` component):
- Form: username, password, email (optional), name (optional), select existing user or create new
- Submit creates new credential user or adds/resets password for existing OAuth user via `POST /api/auth/admin/users`
- List of existing users below the form with "Set Password" action
- Only visible to authenticated users

## CLI Script

`scripts/create-user.ts`:
```ts
// Usage: npx tsx scripts/create-user.ts <username> <password> [email] [name]
// Connects to DB via POSTGRES_URL env var
// Hashes password with bcrypt
// Inserts user with provider='credentials'
```

## Login UI

Add "Sign in with Password" option to the existing sign-in dialog:
- Username field
- Password field
- Submit button
- On success: `window.location.href = '/'` (same as OAuth flow)

## Files to Create/Modify

### Create
- `app/api/auth/signin/credentials/route.ts` — Login API
- `app/api/auth/admin/users/route.ts` — Admin users API (GET + POST)
- `components/auth/sign-in-password.tsx` — Password login form UI
- `scripts/create-user.ts` — CLI script

### Modify
- `lib/db/schema.ts` — Add 'credentials' to provider enum, add password_hash column, update Zod schemas
- `lib/session/types.ts` — Add 'credentials' to authProvider type
- `lib/db/users.ts` — Add `getUserByUsername` function
- `components/auth/sign-in.tsx` — Add "Sign in with Password" button
- `app/settings/page.tsx` — Add "Users" tab

## Security

- Passwords hashed with bcrypt (cost factor 10)
- No plaintext passwords stored or logged
- `password_hash` never returned in API responses
- Rate limiting should be considered for the login endpoint
