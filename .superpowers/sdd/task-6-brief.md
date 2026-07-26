# Task 6: Password Login UI

**Files:**
- Create: components/auth/sign-in-password.tsx
- Modify: components/auth/sign-in.tsx

**Interfaces:**
- Consumes: existing sign-in dialog, sessionAtom from @/lib/atoms/session
- Produces: password login form component, integrated into sign-in

## Steps

- **Step 1: Create password login form component**

Create components/auth/sign-in-password.tsx:

`	ypescript
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
`

- **Step 2: Update sign-in dialog**

Modify components/auth/sign-in.tsx:

Add import:
`	ypescript
import { SignInPassword } from './sign-in-password'
`

Add state after other useState lines (around line 14):
`	ypescript
const [showPasswordForm, setShowPasswordForm] = useState(false)
`

Update the DialogContent section. Replace the opening DialogContent block and its inner content:

The existing DialogContent section renders OAuth buttons. After the DialogDescription and before the closing of the button group </div>, add an "Or" separator and a "Sign in with Password" button. Then conditionally show the password form when showPasswordForm is true.

When showPasswordForm is true:
- Title: "Sign in with Password"
- Description: "Enter your username and password to sign in."
- Content: <SignInPassword onBack={() => setShowPasswordForm(false)} />

When showPasswordForm is false (normal OAuth view):
- Add "Or" separator with a horizontal line
- Add "Sign in with Password" button that sets showPasswordForm(true)
- Keep existing OAuth buttons unchanged

- **Step 3: Run format + type-check**
- **Step 4: Commit**
