import { Metadata } from 'next'
import { CapabilitiesPage } from '@/components/capabilities-page'

export const metadata: Metadata = {
  title: 'Capabilities',
  description: 'Explore everything the platform can do — coding agents, smart routing, sandboxed execution and more.',
}

export default function CapabilitiesRoute() {
  return <CapabilitiesPage />
}
