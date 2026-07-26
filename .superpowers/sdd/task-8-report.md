# Task 8: CLI Script for User Creation - Report

## Summary

Created `scripts/create-user.ts` - a CLI script to create users with credentials authentication.

## Steps Completed

1. **Created `scripts/create-user.ts`**: Script that connects to the database via `POSTGRES_URL`, accepts `<username> <password> [email] [name]` arguments, and inserts a new user with a bcrypt-hashed password.

2. **Ran `pnpm type-check`**: Passed cleanly after fixing a type narrowing issue by moving the `POSTGRES_URL` check inside `main()`.

3. **Ran `pnpm format`**: Prettier formatting applied successfully.

4. **Committed**: `git add scripts/create-user.ts` followed by `git commit -m "feat: add CLI script for user creation"` (commit `7411f81`).

## Changes

- **Created**: `scripts/create-user.ts` (59 lines)
  - Imports `dotenv/config` for environment variables
  - Uses `drizzle-orm/postgres-js` with `postgres` driver
  - Validates required `POSTGRES_URL` env var and arguments
  - Checks for duplicate usernames before inserting
  - Hashes password with bcrypt (10 rounds)
  - Sets `provider: 'credentials'` and `externalId: username`
  - Handles errors gracefully with `process.exit(1)`
