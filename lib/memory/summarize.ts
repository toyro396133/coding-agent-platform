import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { saveMemory } from './engine'

export async function summarizeAndStoreTask(userId: string, taskId: string, prompt: string, agentResponse: string | null) {
  try {
    const contextText = `User Request: ${prompt}\n\nAgent Output: ${agentResponse || 'No specific agent output.'}`

    const { text } = await generateText({
      model: openai('gpt-4o-mini') as any,
      system: `You are an expert system designed to extract long-term memory for an AI coding agent.
Your goal is to read the completion of a task and extract any fixed bugs, constraints, user preferences, or architectural decisions.
Create a concise summary (1-3 sentences) that will be useful for future tasks. If nothing significant was learned or decided, respond with 'NO_MEMORY'.`,
      prompt: contextText
    })

    const trimmedText = text.trim()
    if (trimmedText.length > 0 && trimmedText.toUpperCase() !== 'NO_MEMORY') {
      await saveMemory(userId, trimmedText, taskId)
      console.log(`[Memory] Saved memory for task ${taskId}`)
    }
  } catch (error) {
    console.error(`[Memory] Error summarizing task ${taskId}:`, error)
  }
}
