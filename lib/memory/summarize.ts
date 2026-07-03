import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { saveMemory } from './engine'

function redactSensitiveData(text: string): string {
  let redacted = text
  // Redact API keys and tokens
  redacted = redacted.replace(/\b[A-Za-z0-9]{20,}\b/g, (match) => {
    // Check if it looks like an API key (contains common patterns)
    if (match.match(/^(sk-|pk-|key-|token-|ghp_|gho_|ghu_|ghs_|ghr_)/i)) {
      return '[REDACTED_TOKEN]'
    }
    return match
  })
  // Redact email addresses
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
  // Redact common secret environment variable patterns
  redacted = redacted.replace(/(api[_-]?key|secret|password|token|auth)["\s:=]+["']?[\w-]{8,}["']?/gi, '$1=[REDACTED]')
  return redacted
}

export async function summarizeAndStoreTask(userId: string, taskId: string, prompt: string, agentResponse: string | null) {
  try {
    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log('[Memory] OPENAI_API_KEY not available, skipping memory summarization')
      return
    }

    const sanitizedPrompt = redactSensitiveData(prompt)
    const sanitizedResponse = agentResponse ? redactSensitiveData(agentResponse) : 'No specific agent output.'
    const contextText = `User Request: ${sanitizedPrompt}\n\nAgent Output: ${sanitizedResponse}`

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Memory summarization timed out')), 30000) // 30 second timeout
    })

    const generateTextPromise = generateText({
      model: openai('gpt-4o-mini') as any,
      system: `You are an expert system designed to extract long-term memory for an AI coding agent.
Your goal is to read the completion of a task and extract any fixed bugs, constraints, user preferences, or architectural decisions.
Create a concise summary (1-3 sentences) that will be useful for future tasks. If nothing significant was learned or decided, respond with 'NO_MEMORY'.`,
      prompt: contextText
    })

    const { text } = await Promise.race([generateTextPromise, timeoutPromise])

    if (text !== 'NO_MEMORY' && text.trim().length > 0) {
      const sanitizedMemory = redactSensitiveData(text.trim())
      await saveMemory(userId, sanitizedMemory, taskId)
      console.log(`[Memory] Saved memory for task ${taskId}`)
    }
  } catch (error) {
    console.error(`[Memory] Error summarizing task ${taskId}:`, error)
  }
}
