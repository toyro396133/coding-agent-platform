import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

function getAIGatewayClient() {
  return createOpenAI({
    apiKey: process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: 'https://ai-gateway.vercel.sh/v1',
  })
}

export function getModelClient(modelName: string): any {
  if (modelName.startsWith('gpt')) {
    if (process.env.OPENAI_API_KEY?.startsWith('vck_') || !process.env.OPENAI_API_KEY) {
      return getAIGatewayClient()(modelName)
    }
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    return openai(modelName)
  }

  if (modelName.startsWith('claude')) {
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
      const actualModel = modelName === 'claude-3-5-haiku' ? 'claude-3-5-haiku-20241022' : modelName
      return anthropic(actualModel)
    }
    return getAIGatewayClient()(modelName)
  }

  if (modelName.startsWith('gemini')) {
    if (process.env.GEMINI_API_KEY) {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      })
      return google(modelName)
    }
  }

  // For models with a slash (e.g., inclusionai/ling-3.0-flash-free) or any other model, use AI Gateway
  if (process.env.AI_GATEWAY_API_KEY || !process.env.OPENAI_API_KEY) {
    return getAIGatewayClient()(modelName)
  }

  // Fallback
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  return openai('gpt-4o-mini')
}
