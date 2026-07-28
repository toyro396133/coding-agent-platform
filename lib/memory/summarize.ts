import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { saveMemory } from './engine'
import { db } from '@/lib/db/client'
import { projectRules } from '@/lib/db/schema'

function redactSensitiveData(text: string): string {
  let redacted = text
  // Redact GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_ followed by alphanumerics/underscores)
  redacted = redacted.replace(/\b(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]+/g, '[REDACTED_TOKEN]')
  // Redact OpenAI tokens (sk-, sk-proj- followed by alphanumerics/hyphens)
  redacted = redacted.replace(/\b(sk-proj-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+)/g, '[REDACTED_TOKEN]')
  // Redact other common API key prefixes (pk-, key-, token-)
  redacted = redacted.replace(/\b(pk-|key-|token-)[A-Za-z0-9_-]{20,}/gi, '[REDACTED_TOKEN]')
  // Redact long alphanumeric sequences that look like API keys (20+ chars)
  redacted = redacted.replace(/\b[A-Za-z0-9]{20,}\b/g, (match) => {
    // Check if it looks like an API key (contains common patterns)
    if (match.match(/^(sk-|pk-|key-|token-)/i)) {
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

export async function summarizeAndStoreTask(
  userId: string,
  taskId: string,
  prompt: string,
  agentResponse: string | null,
) {
  try {
    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log('[Memory] OPENAI_API_KEY not available, skipping memory summarization')
      return
    }

    const sanitizedPrompt = redactSensitiveData(prompt)
    const sanitizedResponse = agentResponse ? redactSensitiveData(agentResponse) : 'No specific agent output.'
    const contextText = `User Request: ${sanitizedPrompt}\n\nAgent Output: ${sanitizedResponse}`

    // Create AbortController for timeout handling
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const { text } = await generateText({
        model: openai('gpt-4o-mini') as any,
        system: `You are an expert system designed to extract long-term memory for an AI coding agent.
Your goal is to read the completion of a task and extract any fixed bugs, constraints, user preferences, or architectural decisions.
Create a concise summary (1-3 sentences) that will be useful for future tasks. If nothing significant was learned or decided, respond with 'NO_MEMORY'.`,
        prompt: contextText,
        abortSignal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (text !== 'NO_MEMORY' && text.trim().length > 0) {
        const sanitizedMemory = redactSensitiveData(text.trim())
        await saveMemory(userId, sanitizedMemory, taskId)
        console.log('[Memory] Successfully saved memory for task')
      }
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[Memory] Memory summarization timed out')
      } else {
        console.error(`[Memory] Error summarizing task ${taskId}:`, error)
      }
    }
  } catch (error) {
    console.error(`[Memory] Error summarizing task ${taskId}:`, error)
  }
}

export async function extractAndStoreProjectRules(
  userId: string,
  repoUrl: string,
  taskId: string,
  prompt: string,
  agentResponse: string | null,
) {
  try {
    if (!process.env.OPENAI_API_KEY || !repoUrl) {
      return
    }

    const sanitizedPrompt = redactSensitiveData(prompt)
    const sanitizedResponse = agentResponse ? redactSensitiveData(agentResponse) : ''
    const contextText = `User Request: ${sanitizedPrompt}\n\nAgent Output: ${sanitizedResponse}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const { text } = await generateText({
        model: openai('gpt-4o-mini') as any,
        system: `You are an expert system designed to extract project rules (like Cursor Rules) for an AI coding agent.
Your goal is to read the completion of a task and extract any new coding standards, stylistic preferences, architectural rules, or constraints that should be applied globally to this repository.
Extract rules as a bulleted list. Each bullet must be a clear, standalone rule. Do not include introductory or concluding text. If there are no global rules to extract, respond with 'NO_RULES'.`,
        prompt: contextText,
        abortSignal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (text !== 'NO_RULES' && text.trim().length > 0) {
        const rules = text
          .split('\n')
          .filter((r) => r.trim().startsWith('-'))
          .map((r) => redactSensitiveData(r.replace(/^- /, '').trim()))

        for (const rule of rules) {
          await db.insert(projectRules).values({
            userId,
            repoUrl,
            ruleContent: rule,
            isApproved: false,
            sourceTaskId: taskId,
          })
        }
        console.log('[Rules] Successfully extracted rules for task')
      }
    } catch (error) {
      clearTimeout(timeoutId)
      console.error(`[Rules] Error extracting rules for task ${taskId}:`, error)
    }
  } catch (error) {
    console.error(`[Rules] Error extracting rules for task ${taskId}:`, error)
  }
}
