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

// Pricing lives in the shared Model Registry (ADR-0001) so the catalog
// can never drift between the router, rate-limits and cost estimation.
import { getModelPricing } from '@/lib/ai/model-registry'

/**
 * Rough token estimation based on character count.
 * ~4 characters per token for English, ~1.5 for code
 */
function estimateTokens(text: string): number {
  // More accurate estimation for code: count words + special chars
  const codePatterns = text.match(/[a-zA-Z0-9_]+|[{}()[\]<>;:=+\-*/%&|^~!@#$%^&*(),.?":{}|<>]/g)
  if (!codePatterns) return Math.ceil(text.length / 4)

  // Code has more tokens per character due to special chars
  const codeTokenRatio = text.includes('\n') || /[{}()[\];]/.test(text) ? 3.5 : 4
  return Math.ceil(text.length / codeTokenRatio)
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
  const pricing = getModelPricing(model)

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
  const pricing = getModelPricing(model)

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
