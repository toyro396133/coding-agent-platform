import { Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getDynamicRoutes } from '@/lib/actions/routing'
import { RoutingForm } from './routing-form'
import { AdminUsers } from '@/components/auth/admin-users'
import { PlatformApiKeys } from '@/components/platform-api-keys'

export const metadata = {
  title: 'Settings',
}

/**
 * Renders the settings page for account, agent routing, user, and API key management.
 */
export default async function SettingsPage() {
  const routes = await getDynamicRoutes()

  return (
    <div className="container max-w-4xl py-6 space-y-8 mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account settings and agent routing preferences.</p>
      </div>

      <Tabs defaultValue="routing" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="routing">Agent Routing</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Configure basic platform settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">More settings coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="routing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Multi-Model Sub-Agent Routing</CardTitle>
              <CardDescription>
                Customize which LLM handles dynamically spawned background tasks. The Orchestrator automatically
                discovers and delegates new sub-tasks as needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div>Loading routes...</div>}>
                <RoutingForm initialRoutes={routes} />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users" className="space-y-6">
          <Suspense fallback={<div>Loading...</div>}>
            <AdminUsers />
          </Suspense>
        </TabsContent>
        <TabsContent value="api-keys" className="space-y-6">
          <PlatformApiKeys />
        </TabsContent>
      </Tabs>
    </div>
  )
}
