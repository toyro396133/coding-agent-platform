import { Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getDynamicRoutes } from '@/lib/actions/routing'
import { RoutingForm } from './routing-form'
import { ApiPoolManager } from '@/components/api-pool-manager'
import { VercelIntegration } from '@/components/vercel-integration'
import { NeonIntegration } from '@/components/neon-integration'

export const metadata = {
  title: 'Settings',
}

export default async function SettingsPage() {
  const routes = await getDynamicRoutes()

  return (
    <div className="container max-w-4xl py-6 space-y-8 mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings, agent routing preferences, and API key pools.
        </p>
      </div>

      <Tabs defaultValue="routing" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="routing">Agent Routing</TabsTrigger>
          <TabsTrigger value="apis">API Pool</TabsTrigger>
          <TabsTrigger value="vercel">Vercel</TabsTrigger>
          <TabsTrigger value="neon">Neon</TabsTrigger>
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
        <TabsContent value="apis" className="space-y-6">
          <Suspense fallback={<div>Loading API pool…</div>}>
            <ApiPoolManager />
          </Suspense>
        </TabsContent>
        <TabsContent value="vercel" className="space-y-6">
          <Suspense fallback={<div>Loading Vercel integration…</div>}>
            <VercelIntegration />
          </Suspense>
        </TabsContent>
        <TabsContent value="neon" className="space-y-6">
          <Suspense fallback={<div>Loading Neon integration…</div>}>
            <NeonIntegration />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}
