import { redirect } from 'next/navigation'
import { DashboardContent } from '@/components/dashboard-content'
import { getGitHubStars } from '@/lib/github-stars'
import { getServerSession } from '@/lib/session/get-server-session'

export default async function DashboardPage() {
  const session = await getServerSession()

  if (!session?.user) {
    redirect('/')
  }

  const stars = await getGitHubStars()

  return <DashboardContent user={session.user} authProvider={session.authProvider} initialStars={stars} />
}
