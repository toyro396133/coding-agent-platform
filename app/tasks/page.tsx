import { redirect } from 'next/navigation'
import { TasksListClient } from '@/components/tasks-list-client'
import { getGitHubStars } from '@/lib/github-stars'
import { getServerSession } from '@/lib/session/get-server-session'

export default async function TasksListPage() {
  const session = await getServerSession()
  const stars = await getGitHubStars()

  // Redirect to home if not authenticated
  if (!session?.user) {
    redirect('/')
  }

  return <TasksListClient user={session.user} authProvider={session.authProvider} initialStars={stars} />
}
