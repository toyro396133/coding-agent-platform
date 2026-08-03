import { redirect } from 'next/navigation'
import { AgentsContent } from '@/components/agents-content'
import { getGitHubStars } from '@/lib/github-stars'
import { getServerSession } from '@/lib/session/get-server-session'

export default async function AgentsPage() {
  const session = await getServerSession()

  if (!session?.user) {
    redirect('/')
  }

  const stars = await getGitHubStars()

  return <AgentsContent user={session.user} initialStars={stars} />
}
