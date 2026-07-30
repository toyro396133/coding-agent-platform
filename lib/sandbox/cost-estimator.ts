/**
 * Token Counting & Cost Estimation
 *
 * Estimates API costs before execution using:
 * - tiktoken-style token counting
 * - Model-specific pricing tables
 * - Prompt caching estimates
 */

// Re-export types for the UI
import type { PipelineStageData } from '@/lib/types/pipeline'
export type { PipelineStageData }

// Model pricing per 1M tokens (in USD) as of mid-2026
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
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

// Default pricing for unknown models
const DEFAULT_PRICING = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }

/**
 * Rough token estimation based on character count.
 * ~4 characters per token for English, ~1.5 for code
 */
function estimateTokens(text: string): number {
  // More accurate estimation for code: count words + special chars
  const codePatterns = text.match(/[a-zA-Z0-9_]+|[{}()\[\]<>;:=+\-*/%&|^~!@#$%^&*(),.?":{}|<>]/g)
  if (!codePatterns) return Math.ceil(text.length / 4)

  // Code has more tokens per character due to special chars
  const codeTokenRatio = text.includes('\n') || /[{}()[\];]/.test(text) ? 3.5 : 4
  return Math.ceil(text.length / codeTokenRatio)
}

/**
 * Get pricing info for a model, with fallback to defaults.
 */
function getPricing(model: string) {
  return MODEL_PRICING[model] || DEFAULT_PRICING
}

/**
 * Estimate the cost of a complete agent session.
 */
export function estimateAgentCost(params: {
  systemPrompt: string
  userPrompt: string
  model: string
  contextFiles?: string[]
  estimatedTurns?: number
  estimatedOutputTokens?: number
}): {
  estimatedCost: number
  estimatedTokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  breakdown: string
} {
  const { systemPrompt, userPrompt, model, contextFiles, estimatedTurns = 5, estimatedOutputTokens = 2000 } = params
  const pricing = getPricing(model)

  // Estimate total input tokens
  const systemTokens = estimateTokens(systemPrompt || '')
  const userTokens = estimateTokens(userPrompt)
  const contextTokens = (contextFiles || []).reduce((sum, f) => sum + estimateTokens(f), 0)

  // First turn: full context (no cache hit)
  const firstTurnInput = systemTokens + userTokens + contextTokens

  // Subsequent turns: cached system prompt + new user input
  const cachedSystemTokens = Math.ceil(systemTokens * 0.9) // 90% cache hit rate
  const subsequentInputPerTurn = Math.ceil(firstTurnInput * 0.6) // 60% of first turn on average

  const turns = Math.max(1, Math.min(estimatedTurns, 20)) // Clamp to [1, 20]
  const totalInputTokens = firstTurnInput + subsequentInputPerTurn * (turns - 1)
  const totalOutputTokens = estimatedOutputTokens * turns
  const cacheReadTokens = cachedSystemTokens * (turns - 1)
  const cacheWriteTokens = systemTokens // First turn writes to cache

  // Calculate costs
  const inputCost = (totalInputTokens / 1_000_000) * pricing.input
  const outputCost = (totalOutputTokens / 1_000_000) * pricing.output
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWrite

  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost

  const breakdown = [
    `Model: ${model}`,
    `Input: ~${(totalInputTokens / 1000).toFixed(0)}K tokens → $${inputCost.toFixed(4)}`,
    `Output: ~${(totalOutputTokens / 1000).toFixed(0)}K tokens → $${outputCost.toFixed(4)}`,
    `Cache Read: ~${(cacheReadTokens / 1000).toFixed(0)}K tokens → $${cacheReadCost.toFixed(4)}`,
    `Cache Write: ~${(cacheWriteTokens / 1000).toFixed(0)}K tokens → $${cacheWriteCost.toFixed(4)}`,
    `Estimated turns: ${turns}`,
    `──────────────────────`,
    `Total: **~$${totalCost.toFixed(4)}**`,
  ].join('\n')

  return {
    estimatedCost: totalCost,
    estimatedTokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
    },
    breakdown,
  }
}

/**
 * Estimate cost based on prompt length and model selection (quick version).
 */
export function quickCostEstimate(
  prompt: string,
  model: string,
): {
  estimatedCost: string
  costLevel: 'free' | 'cheap' | 'moderate' | 'expensive'
} {
  const promptTokens = estimateTokens(prompt)
  const pricing = getPricing(model)

  // Assume 1 turn with 1K output
  const inputCost = (promptTokens / 1_000_000) * pricing.input
  const outputCost = (1000 / 1_000_000) * pricing.output
  const total = inputCost + outputCost

  let costLevel: 'free' | 'cheap' | 'moderate' | 'expensive'
  if (total < 0.001) costLevel = 'free'
  else if (total < 0.01) costLevel = 'cheap'
  else if (total < 0.05) costLevel = 'moderate'
  else costLevel = 'expensive'

  return {
    estimatedCost: total < 0.001 ? '<$0.001' : `~$${total.toFixed(4)}`,
    costLevel,
  }
}

/**
 * Get cost level display info.
 */
export function getCostLevelInfo(level: 'free' | 'cheap' | 'moderate' | 'expensive'): {
  label: string
  color: string
  icon: string
} {
  switch (level) {
    case 'free':
      return { label: 'Free tier eligible', color: 'text-emerald-500', icon: '🆓' }
    case 'cheap':
      return { label: 'Very affordable', color: 'text-green-500', icon: '💰' }
    case 'moderate':
      return { label: 'Moderate cost', color: 'text-amber-500', icon: '💵' }
    case 'expensive':
      return { label: 'Premium model pricing', color: 'text-red-500', icon: '💎' }
  }
}
