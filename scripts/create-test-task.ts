import 'dotenv/config'
import { db } from '../lib/db/client'
import { tasks } from '../lib/db/schema'
import { getUserByUsername } from '../lib/db/users'
import { generateId } from '../lib/utils/id'

async function main() {
  const user = await getUserByUsername('admin')
  if (!user) {
    console.error('User not found')
    process.exit(1)
  }

  const taskId = generateId(12)
  await db.insert(tasks).values({
    id: taskId,
    userId: user.id,
    prompt: 'Create a simple hello world HTML page',
    title: 'Hello World',
    selectedAgent: 'claude',
    selectedModel: 'sonnet-4-5',
    installDependencies: false,
    status: 'pending',
    progress: 0,
    logs: [],
  })

  console.log(`Test task created: id=${taskId}`)
  process.exit(0)
}

main()
