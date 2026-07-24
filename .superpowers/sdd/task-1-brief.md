# Task 1: Database Schema Updates

**Files:**
- Modify: lib/db/schema.ts

**Interfaces:**
- Consumes: existing schema definitions
- Produces: updated users table with password_hash column and 'credentials' in provider enum

## Steps

- **Step 1: Update provider enum and add password_hash**

Update lib/db/schema.ts:
- Change provider enum from ['github', 'vercel'] to ['github', 'vercel', 'credentials']
- Add password_hash: text('password_hash') field to users table (after vatarUrl)
- Update insertUserSchema to include optional password_hash
- Update selectUserSchema to include nullable password_hash

In users table definition - change provider enum line:
`	ypescript
provider: text('provider', {
  enum: ['github', 'vercel', 'credentials'],
}).notNull(),
`

Add after avatarUrl line:
`	ypescript
passwordHash: text('password_hash'),
`

Update insertUserSchema to include:
`	ypescript
passwordHash: z.string().optional(),
`

Update selectUserSchema to include:
`	ypescript
passwordHash: z.string().nullable(),
`

- **Step 2: Run type check** - pnpm type-check
- **Step 3: Generate migration** - pnpm db:generate
- **Step 4: Run format and commit**
