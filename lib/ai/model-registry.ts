/**
 * lib/ai/model-registry.ts — The single source of truth for model metadata.
 *
 * Per ADR-0001, every model name lives here exactly once, together with its:
 *  - provider family (openai / anthropic / gemini / cursor / deepseek / aigateway)
 *  - per-1M-token pricing (input / output / cacheRead / cacheWrite, USD)
 *  - tier grouping (fast / balanced / powerful) used by the router
 *
 * Consumers (cost-estimator, rate-limits, router) import from this registry
 * instead of redefining the catalog, so a model can never drift between them.
 */

// ─── Provider identification ────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'cursor' | 'deepseek' | 'aigateway'

/** Every known model mapped to its provider family */
export const MODEL_PROVIDER_MAP: Record<string, LlmProvider> = {
  // OpenAI
  'gpt-5': 'openai',
  'gpt-5-codex': 'openai',
  'gpt-5-pro': 'openai',
  'gpt-5-mini': 'openai',
  'gpt-5-nano': 'openai',
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'openai/gpt-5.1': 'openai',
  'openai/gpt-5.1-codex': 'openai',
  'openai/gpt-5.1-codex-mini': 'openai',
  'openai/gpt-4.1': 'openai',
  'openai/o3': 'openai',
  'openai/o3-mini': 'openai',
  'openai/o4-mini': 'openai',
  'openai/gpt-4.5-preview': 'openai',

  // Anthropic
  'claude-sonnet-4-5': 'anthropic',
  'claude-opus-4-5': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  'claude-sonnet-4': 'anthropic',
  'claude-3-5-sonnet': 'anthropic',
  'claude-3-5-haiku': 'anthropic',
  'anthropic/claude-opus-4.6': 'anthropic',
  'anthropic/claude-opus-4.5': 'anthropic',
  'anthropic/claude-sonnet-4': 'anthropic',
  'anthropic/claude-3.5-sonnet': 'anthropic',

  // Google
  'gemini-2.5-pro': 'gemini',
  'gemini-2.5-flash': 'gemini',
  'gemini-3-pro-preview': 'gemini',
  'gemini-3-flash': 'gemini',
  'google-gla/gemini-2.5-flash': 'gemini',

  // Cursor
  'composer-1': 'cursor',
  'sonnet-4.5': 'cursor',
  'sonnet-4.5-thinking': 'cursor',
  'opus-4.5': 'cursor',
  'opus-4.1': 'cursor',

  // DeepSeek
  'deepseek-chat': 'deepseek',
  'deepseek-coder': 'deepseek',

  // Open-source / other models served via the AI Gateway
  'qwen-3.5-235b-a3b': 'aigateway',
  grok: 'aigateway',
}

// ─── Pricing ────────────────────────────────────────────────────────────

export interface ModelPricing {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Model pricing per 1M tokens (USD) — as of mid-2026 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI models
  'gpt-5': { input: 10, output: 40, cacheRead: 2.5, cacheWrite: 10 },
  'gpt-5-codex': { input: 15, output: 60, cacheRead: 3.75, cacheWrite: 15 },
  'gpt-5-pro': { input: 20, output: 80, cacheRead: 5, cacheWrite: 20 },
  'gpt-5-mini': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
  'gpt-5-nano': { input: 0.5, output: 2, cacheRead: 0.125, cacheWrite: 0.5 },
  'gpt-4o': { input: 5, output: 15, cacheRead: 1.25, cacheWrite: 5 },
  'gpt-4o-mini': { input: 0.5, output: 2, cacheRead: 0.125, cacheWrite: 0.5 },
  'openai/gpt-4.1': { input: 3, output: 12, cacheRead: 0.75, cacheWrite: 3 },
  'openai/o3': { input: 15, output: 60, cacheRead: 3.75, cacheWrite: 15 },
  'openai/o3-mini': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
  'openai/o4-mini': { input: 1, output: 4, cacheRead: 0.25, cacheWrite: 1 },
  'openai/gpt-5.1': { input: 8, output: 32, cacheRead: 2, cacheWrite: 8 },
  'openai/gpt-5.1-codex': { input: 12, output: 48, cacheRead: 3, cacheWrite: 12 },
  'openai/gpt-5.1-codex-mini': { input: 3, output: 12, cacheRead: 0.75, cacheWrite: 3 },

  // Anthropic models
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-5': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'anthropic/claude-opus-4.6': { input: 20, output: 100, cacheRead: 2, cacheWrite: 25 },
  'anthropic/claude-opus-4.5': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'anthropic/claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },

  // Google models
  'gemini-2.5-pro': { input: 1.25, output: 5, cacheRead: 0.125, cacheWrite: 1.25 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6, cacheRead: 0.015, cacheWrite: 0.15 },
  'gemini-3-pro-preview': { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 2 },
  'gemini-3-flash': { input: 0.2, output: 0.8, cacheRead: 0.02, cacheWrite: 0.2 },

  // Open source / other
  'deepseek-chat': { input: 0.5, output: 2, cacheRead: 0.05, cacheWrite: 0.5 },
  'deepseek-coder': { input: 0.5, output: 2, cacheRead: 0.05, cacheWrite: 0.5 },
  'qwen-3.5-235b-a3b': { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.3 },
  grok: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
}

/** Default pricing for unknown models */
export const DEFAULT_MODEL_PRICING: ModelPricing = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }

/** Get pricing for a model, falling back to defaults. */
export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] || DEFAULT_MODEL_PRICING
}

// ─── Tier grouping (used by the router) ─────────────────────────────────

export const MODEL_TIERS = {
  fast: ['gpt-4o-mini', 'gemini-2.5-flash', 'claude-haiku-4-5', 'gpt-5-nano'],
  balanced: ['gpt-4o', 'gemini-2.5-pro', 'claude-sonnet-4-5', 'gpt-5-mini'],
  powerful: ['gpt-5', 'claude-opus-4-5', 'gemini-3-pro-preview', 'gpt-5-codex'],
} as const

export type ModelTier = keyof typeof MODEL_TIERS
