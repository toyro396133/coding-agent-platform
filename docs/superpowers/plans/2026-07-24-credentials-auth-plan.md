# Credentials Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password login as an additional auth method alongside GitHub and Vercel OAuth.

**Architecture:** Extend existing `users` table with `password_hash` column and `'credentials'` provider. Reuse existing JWE cookie session mechanism. Admin UI and CLI script for user management.

**Tech Stack:** Next.js, Drizzle ORM, PostgreSQL, bcryptjs, JWE (jose)

## Global Constraints

- No dynamic values in log statements (see AGENTS.md)
- Run `pnpm format && pnpm type-check && pnpm lint` after each task
- Follow existing code patterns (shadcn/ui components, Tailwind, same formatting)
- `password_hash` must never be returned in API responses
- bcryptjs for password hashing (cost factor 10)

---

### Task 1: Database Schema Updates

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Consumes: existing schema definitions
- Produces: updated `users` table with `password_hash` column and `'credentials'` in provider enum

- [ ] **Step 1: Update provider enum and add password_hash**

Update `lib/db/schema.ts`:
- Change `provider` enum from `['github', 'vercel']` to `['github', 'vercel', 'credentials']`
- Add `password_hash: text('password_hash')` field to `users` table (after `avatarUrl`)
- Update `insertUserSchema` to include optional `password_hash`
- Update `selectUserSchema` to include nullable `password_hash`

```typescript
// In users table definition - change provider enum line:
provider: text('provider', {
  enum: ['github', 'vercel', 'credentials'],
}).notNull(),

// Add after avatarUrl line:
passwordHash: text('password_hash'),
```

Update `insertUserSchema`:
```typescript
export const insertUserSchema = z.object({
  id: z.string().optional(),
  provider: z.enum(['github', 'vercel', 'credentials']),
  externalId: z.string().min(1, 'External ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  scope: z.string().optional(),
  passwordHash: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  ...
})
```

Update `selectUserSchema`:
```typescript
export const selectUserSchema = z.object({
  ...
  passwordHash: z.string().nullable(),
  ...
})
```

- [ ] **Step 2: Run type check**

```bash
pnpm type-check
```

- [ ] **Step 3: Generate migration**

```bash
pnpm db:generate
```

- [ ] **Step 4: Run format and commit**

```bash
pnpm format
git add -A
git commit -m "feat: extend users table for credentials auth"
```

---

### Task 2: Session Type Updates

**Files:**
- Modify: `lib/session/types.ts`

**Interfaces:**
- Produces: `Session.authProvider` accepts `'credentials'`

- [ ] **Step 1: Add 'credentials' to authProvider types**

In `lib/session/types.ts`, update both `SessionUserInfo.authProvider` and `Session.authProvider`:

```typescript
export interface SessionUserInfo {
  user: User | undefined
  authProvider?: 'github' | 'vercel' | 'credentials'
}

export interface Session {
  created: number
  authProvider: 'github' | 'vercel' | 'credentials'
  user: User
}
```

- [ ] **Step 2: Run format + type-check + commit**

```bash
pnpm format
pnpm type-check
git add -A
git commit -m "feat: add credentials to session auth provider types"
```

---

### Task 3: User Database Functions

**Files:**
- Modify: `lib/db/users.ts`

**Interfaces:**
- Produces: `getUserByUsername(username: string) => Promise<User | null>`

- [ ] **Step 1: Add getUserByUsername function**

Add to `lib/db/users.ts`:

```typescript
export async function getUserByUsername(username: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  return result[0] || null
}
```

- [ ] **Step 2: Run format + type-check + commit**

```bash
pnpm format
pnpm type-check
git add -A
git commit -m "feat: add getUserByUsername db function"
```

---

### Task 4: Credentials Login API

**Files:**
- Create: `app/api/auth/signin/credentials/route.ts`
- Install: `bcryptjs` + `@types/bcryptjs`

**Interfaces:**
- Consumes: `getUserByUsername` (Task 3), `saveSession` from existing `lib/session/create.ts`
- Produces: `POST /api/auth/signin/credentials` endpoint

- [ ] **Step 1: Install bcryptjs**

```bash
pnpm add bcryptjs
pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: Create login route**

Create `app/api/auth/signin/credentials/route.ts`:

```typescript
import 'server-only'

import { NextResponse } from 'next/server'
import { getUserByUsername } from '@/lib/db/users'
import { saveSession } from '@/lib/session/create'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 },
      )
    }

    const user = await getUserByUsername(username)
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 },
      )
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 },
      )
    }

    const session = {
      created: Date.now(),
      authProvider: 'credentials' as const,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || undefined,
        name: user.name || user.username,
        avatar: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`,
      },
    }

    const response = NextResponse.json({ success: true })
    await saveSession(response, session)

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'An error occurred during sign in' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 3: Run format + type-check + commit**

```bash
pnpm format
pnpm type-check
git add -A
git commit -m "feat: add credentials login API endpoint"
```

---

### Task 5: Admin Users API

**Files:**
- Create: `app/api/auth/admin/users/route.ts`

**Interfaces:**
- Produces: `GET /api/auth/admin/users` (list users), `POST /api/auth/admin/users` (create/update)

- [ ] **Step 1: Create admin users route**

Create `app/api/auth/admin/users/route.ts`:

```typescript
import 'server-only'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserByUsername } from '@/lib/db/users'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        name: users.name,
        provider: users.provider,
        createdAt: users.createdAt,
        hasPassword: users.passwordHash,
      })
      .from(users)
      .orderBy(users.createdAt)

    const safeUsers = allUsers.map((u) => ({
      ...u,
      hasPassword: u.hasPassword ? true : false,
    }))

    return NextResponse.json({ users: safeUsers })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { username, password, email, name, userId } = body

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    if (userId) {
      // Update existing user's password
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (existing.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 },
        )
      }

      await db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))

      return NextResponse.json({ success: true, userId })
    }

    // Create new user
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required for new users' },
        { status: 400 },
      )
    }

    const existing = await getUserByUsername(username)
    if (existing) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 },
      )
    }

    const newUserId = nanoid()
    const now = new Date()

    await db.insert(users).values({
      id: newUserId,
      provider: 'credentials',
      externalId: username,
      accessToken: '',
      username,
      email: email || null,
      name: name || null,
      passwordHash,
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })

    return NextResponse.json({
      success: true,
      userId: newUserId,
      username,
    })
  } catch (error) {
    console.error('Failed to create user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Run format + type-check + commit**

```bash
pnpm format
pnpm type-check
git add -A
git commit -m "feat: add admin users API"
```

---

### Task 6: Password Login UI

**Files:**
- Create: `components/auth/sign-in-password.tsx`
- Modify: `components/auth/sign-in.tsx`

**Interfaces:**
- Consumes: sign-in dialog from existing `sign-in.tsx`
- Produces: password login form component, integrated into sign-in flow

- [ ] **Step 1: Create password login form component**

Create `components/auth/sign-in-password.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useSetAtom } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'

export function SignInPassword({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const setSession = useSetAtom(sessionAtom)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        toast.success('Signed in successfully')
        setSession({ user: undefined })
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Invalid credentials')
      }
    } catch {
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading ? 'Signing in...' : 'Sign in'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        Back to sign in options
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Update sign-in dialog to include password option**

Modify `components/auth/sign-in.tsx` — add state for showing password form, add "Sign in with Password" button, and conditionally render the password form:

```typescript
// Add import at top
import { SignInPassword } from './sign-in-password'

// Inside the component, add state after other useState lines:
const [showPasswordForm, setShowPasswordForm] = useState(false)
```

Replace the dialog content section. After the closing `</DialogDescription>` and before the `div.flex.flex-col.gap-3`, add a conditional. Here's the full replacement block:

```typescript
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {showPasswordForm ? 'Sign in with Password' : 'Sign in'}
          </DialogTitle>
          <DialogDescription>
            {showPasswordForm
              ? 'Enter your username and password to sign in.'
              : hasGitHub && hasVercel
                ? 'Choose how you want to sign in to continue.'
                : hasVercel
                  ? 'Sign in with Vercel to continue.'
                  : 'Sign in to continue.'}
          </DialogDescription>
        </DialogHeader>

        {showPasswordForm ? (
          <SignInPassword onBack={() => setShowPasswordForm(false)} />
        ) : (
          <div className="flex flex-col gap-3 py-4">
            ...existing buttons...

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              onClick={() => setShowPasswordForm(true)}
              variant="outline"
              size="lg"
              className="w-full"
            >
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Sign in with Password
            </Button>
          </div>
        )}
      </DialogContent>
```

- [ ] **Step 3: Run format + type-check + commit**

```bash
pnpm format
pnpm type-check
git add -A
git commit -m "feat: add password sign-in UI"
```

---

### Task 7: Admin Users UI

**Files:**
- Create: `components/auth/admin-users.tsx`
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: existing settings page tab structure
- Produces: "Users" tab in settings with create form and user list

- [ ] **Step 1: Create admin users component**

Create `components/auth/admin-users.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'

interface UserInfo {
  id: string
  username: string
  email: string | null
  name: string | null
  provider: string
  createdAt: string
  hasPassword: boolean
}

export function AdminUsers() {
  const session = useAtomValue(sessionAtom)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/auth/admin/users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      console.error('Failed to fetch users')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: selectedUserId ? undefined : username,
          password,
          email: email || undefined,
          name: name || undefined,
          userId: selectedUserId || undefined,
        }),
      })

      if (res.ok) {
        toast.success(selectedUserId ? 'Password set successfully' : 'User created successfully')
        setPassword('')
        setEmail('')
        setName('')
        if (!selectedUserId) setUsername('')
        setSelectedUserId('')
        fetchUsers()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create user')
      }
    } catch {
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (!session.user) return null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{selectedUserId ? 'Set Password for Existing User' : 'Create New User'}</CardTitle>
          <CardDescription>
            {selectedUserId
              ? 'Set or reset password for an existing user.'
              : 'Create a new user with username and password authentication.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="existing-user">User (leave empty for new user)</Label>
                <select
                  id="existing-user"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">-- Create new user --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.provider}){u.hasPassword ? ' 🔑' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {!selectedUserId && (
                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : selectedUserId ? 'Set Password' : 'Create User'}
            </Button>
            {selectedUserId && (
              <Button
                type="button"
                variant="ghost"
                className="ml-2"
                onClick={() => setSelectedUserId('')}
              >
                Cancel
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>All registered users on the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Username</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th className="text-left py-2 px-2">Provider</th>
                  <th className="text-left py-2 px-2">Password</th>
                  <th className="text-left py-2 px-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2 px-2">{u.username}</td>
                    <td className="py-2 px-2 text-muted-foreground">{u.email || '-'}</td>
                    <td className="py-2 px-2">{u.provider}</td>
                    <td className="py-2 px-2">
                      {u.hasPassword ? (
                        <span className="text-green-600">Set</span>
                      ) : (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => {
                            setSelectedUserId(u.id)
                            setUsername(u.username)
                          }}
                        >
                          Set Password
                        </Button>
                      )}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Add Users tab to settings page**

Update `app/settings/page.tsx` — add "Users" tab:

```typescript
// Add import at top
import { AdminUsers } from '@/components/auth/admin-users'

// Add TabsTrigger for users after existing triggers:
<TabsTrigger value="users">Users</TabsTrigger>

// Add TabsContent for users after existing content:
<TabsContent value="users">
  <AdminUsers />
</TabsContent>
```

- [ ] **Step 3: Run format + type-check + commit**

```bash
pnpm format
pnpm type-check
git add -A
git commit -m "feat: add admin users UI"
```

---

### Task 8: CLI Script for User Creation

**Files:**
- Create: `scripts/create-user.ts`

- [ ] **Step 1: Create CLI script**

Create `scripts/create-user.ts`:

```typescript
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from '../lib/db/schema'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'

const url = process.env.POSTGRES_URL
if (!url) {
  console.error('POSTGRES_URL environment variable is required')
  process.exit(1)
}

const [, , username, password, email, name] = process.argv

if (!username || !password) {
  console.error('Usage: npx tsx scripts/create-user.ts <username> <password> [email] [name]')
  process.exit(1)
}

async function main() {
  const client = postgres(url)
  const db = drizzle(client, { schema }) as any

  const existing = await db
    .select()
    .from(users)
    .where({ username })
    .limit(1)

  if (existing.length > 0) {
    console.error('Error: Username already exists')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const id = nanoid()
  const now = new Date()

  await db.insert(users).values({
    id,
    provider: 'credentials',
    externalId: username,
    accessToken: '',
    username,
    email: email || null,
    name: name || null,
    passwordHash,
    avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  })

  console.log(`User created successfully: ${username} (${id})`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Failed to create user:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run format + type-check**

```bash
pnpm format
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add CLI script for user creation"
```
