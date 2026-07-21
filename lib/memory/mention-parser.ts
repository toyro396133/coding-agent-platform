import { db } from '../db/client'
import { tasks, memories } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'

/**
 * Enriches a prompt with context for mentioned tasks and agents.
 *
 * @param userId - The user whose task and memory data may be included
 * @param prompt - The input prompt to scan for mentions
 * @returns The original prompt followed by context for any recognized mentions
 */
export async function parseMentionsAndInjectContext(userId: string, prompt: string): Promise<string> {
  const taskMentions = prompt.match(/@task_([a-zA-Z0-9_-]+)/g) || []
  let contextInjection = ''

  if (taskMentions.length > 0) {
    contextInjection += '\n\n--- Mentioned Tasks Context ---\n'

    for (const mention of taskMentions) {
      const taskId = mention.replace('@task_', '')

      const [task] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
        .limit(1)

      if (task) {
        contextInjection += `\nTask ${taskId} (${task.title || 'Untitled'}):\n`
        contextInjection += `Prompt: ${task.prompt}\n`

        // Try to fetch memory summary if it exists
        const memoriesData = await db
          .select({ content: memories.content })
          .from(memories)
          .where(and(eq(memories.taskId, taskId), eq(memories.userId, userId)))
          .orderBy(sql`${memories.createdAt} DESC`)
          .limit(1)
        if (memoriesData.length > 0) {
          contextInjection += `Summary/Learnings: ${memoriesData[0].content}\n`
        }

        contextInjection += `Status: ${task.status}\n`
      } else {
        contextInjection += `\nTask ${taskId} not found or inaccessible.\n`
      }
    }
  }

  const agentMentions = prompt.match(/@(claude|cursor|copilot)/g) || []
  if (agentMentions.length > 0) {
    contextInjection += '\n\n--- Mentioned Agents Context ---\n'
    // Simplified capability injection
    for (const mention of agentMentions) {
      const agentName = mention.replace('@', '')
      contextInjection += `\nAgent ${agentName}: Mentioned by user to focus on specific capabilities related to ${agentName}.\n`
    }
  }

  return prompt + contextInjection
}
