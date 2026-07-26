### Task 2: Database + Session + API for Locale

**Files:**
- Modify: `lib/db/schema.ts` — add `locale` column to users table
- Modify: `lib/db/users.ts` — add `updateUserLocale` function
- Modify: `lib/session/types.ts` — add locale to Session/User type
- Create: `app/api/user/locale/route.ts` — PATCH endpoint
- Modify: relevant session files to read locale from DB

**Interfaces:**
- Produces: DB migration for locale column, `PATCH /api/user/locale` endpoint returning `{ success: true }`, `User` type including `locale: string`

**Implementation steps:**

1. **Add `locale` field to `lib/db/schema.ts`** — after `passwordHash`, add:
   ```typescript
   locale: text('locale').default('he').notNull(),
   ```
   Also update `insertUserSchema` with `locale: z.enum(['en', 'he']).optional()`

2. **Add `locale` to `lib/session/types.ts`** — User interface gets:
   ```typescript
   locale?: 'en' | 'he'
   ```

3. **Read locale from DB when building session** — in the session creation code (`getServerSession()`), include the locale field from the user query.

4. **Create `app/api/user/locale/route.ts`**:
   ```typescript
   import { NextRequest, NextResponse } from 'next/server'
   import { getServerSession } from '@/lib/session/get-server-session'
   import { updateUserLocale } from '@/lib/db/users'

   export async function PATCH(request: NextRequest) {
     const session = await getServerSession()
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }
     const { locale } = await request.json()
     if (locale !== 'en' && locale !== 'he') {
       return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
     }
     await updateUserLocale(session.user.id, locale)
     return NextResponse.json({ success: true })
   }
   ```

5. **Add `updateUserLocale` to `lib/db/users.ts`**:
   ```typescript
   export async function updateUserLocale(userId: string, locale: 'en' | 'he') {
     return await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId))
   }
   ```

6. **Find where `getServerSession()` builds the user object** and add `locale` to it. Look in `lib/session/*` files for where the user query selects fields and constructs the response.

7. **Verify**: `pnpm type-check` passes cleanly.

**Report back with:** status, list of commits made, type-check results, any concerns.
