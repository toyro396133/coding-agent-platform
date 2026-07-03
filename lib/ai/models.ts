import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export function getModelClient(modelName: string): any {
  // We use standard env vars, which the user provides or are already set

  if (modelName.startsWith('gpt')) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    return openai(modelName)
  }

  if (modelName.startsWith('claude')) {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
    const actualModel = modelName === 'claude-3-5-haiku' ? 'claude-3-5-haiku-20241022' : modelName
    return anthropic(actualModel)
  }

  if (modelName.startsWith('gemini')) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    })
    return google(modelName)
  }

  // Fallback
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  return openai('gpt-4o-mini')
}
