import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'aigateway' | 'deepseek'

/**
 * Resolve a model client from a model name. The Vercel AI Gateway uses a
 * different routing convention (`anthropic/claude-3-5-sonnet` style) so it
 * is treated as a top-level provider. We lazily import `@ai-sdk/gateway`
 * (or fall back to a manual OpenAI-compatible wrapper) to avoid forcing
 * a hard dependency on it if the user has not enabled the gateway key.
 */
export function getModelClient(modelName: string): any {
  // AI Gateway models are prefixed with "<vendor>/<model>" – route everything
  // with a "/" through the gateway base URL.
  if (modelName.includes('/')) {
    return getGatewayModel(modelName)
  }

  if (modelName.startsWith('gpt') || modelName.includes('openai')) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai(modelName)
  }

  if (modelName.startsWith('claude') || modelName.includes('sonnet') || modelName.includes('opus')) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const actualModel = modelName === 'claude-3-5-haiku' ? 'claude-3-5-haiku-20241022' : modelName
    return anthropic(actualModel)
  }

  if (modelName.startsWith('gemini')) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })
    return google(modelName)
  }

  if (modelName.startsWith('deepseek')) {
    const ds = createOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    })
    return ds(modelName)
  }

  // Fallback to a sensible OpenAI model to avoid total failure.
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai('gpt-4o-mini')
}

function getGatewayModel(modelName: string): any {
  // We construct an OpenAI-compatible client that points at the AI Gateway
  // HTTP endpoint. The model id we pass contains the literal "vendor/model"
  // syntax the gateway expects.
  const gatewayKey = process.env.AI_GATEWAY_API_KEY
  const baseURL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1'
  const openai = createOpenAI({ apiKey: gatewayKey, baseURL })
  return openai(modelName)
}

/** Map a provider identifier + model into a fully qualified gateway model id. */
export function toGatewayModelId(provider: ProviderName, model: string): string {
  if (provider === 'openai') return model.startsWith('openai/') ? model : `openai/${model}`
  if (provider === 'anthropic') return model.startsWith('anthropic/') ? model : `anthropic/${model}`
  if (provider === 'gemini') return model.startsWith('google/') ? model : `google/${model}`
  return model
}
