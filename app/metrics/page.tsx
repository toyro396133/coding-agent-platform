import { BarChart3 } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { RoutingMetricsDashboard } from '@/components/routing-metrics-dashboard'
import { getServerSession } from '@/lib/session/get-server-session'

export const metadata: Metadata = {
  title: 'Router Metrics',
  description: 'Live observability for the smart model router — routing paths, cache performance, and model usage.',
}

export default async function MetricsPage() {
  const session = await getServerSession()

  // The metrics API is session-scoped; redirect anonymous visitors to the sign-in page
  if (!session?.user) {
    redirect('/')
  }

  return (
    <div className="container max-w-5xl py-6 mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold tracking-tight">Router Metrics</h2>
        </div>
        <p className="text-muted-foreground mt-1">
          Live observability for the smart router: fast-path vs LLM-path routing, cache efficiency, and model usage.
        </p>
      </div>

      <RoutingMetricsDashboard />
    </div>
  )
}
