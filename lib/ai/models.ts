import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export interface ModelClientConfig {
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GEMINI_API_KEY?: string
}

export function getModelClient(modelName: string, apiKeys?: ModelClientConfig): any {
  // Use provided API keys if available, otherwise fall back to process.env

  if (modelName.startsWith('gpt')) {
    const openai = createOpenAI({
      apiKey: apiKeys?.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    })
    return openai(modelName)
  }

  if (modelName.startsWith('claude')) {
    const anthropic = createAnthropic({
      apiKey: apiKeys?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    })
    const actualModel = modelName === 'claude-3-5-haiku' ? 'claude-3-5-haiku-20241022' : modelName
    return anthropic(actualModel)
  }

  if (modelName.startsWith('gemini')) {
    const google = createGoogleGenerativeAI({
      apiKey: apiKeys?.GEMINI_API_KEY || process.env.GEMINI_API_KEY,
    })
    return google(modelName)
  }

  // Fallback
  const openai = createOpenAI({
    apiKey: apiKeys?.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  })
  return openai('gpt-4o-mini')
}
