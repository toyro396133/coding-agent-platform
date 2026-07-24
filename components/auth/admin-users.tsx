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
                      {u.username} ({u.provider}){u.hasPassword ? ' (has password)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {!selectedUserId && (
                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
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
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : selectedUserId ? 'Set Password' : 'Create User'}
            </Button>
            {selectedUserId && (
              <Button type="button" variant="ghost" className="ml-2" onClick={() => setSelectedUserId('')}>
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
                    <td className="py-2 px-2 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
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
