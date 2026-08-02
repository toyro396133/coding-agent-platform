/**
 * RateLimitManager — orchestrates tracking, rotation, and throttling.
 *
 * The manager is the entry point for the Smart Router to ask:
 * "Which model should I use, given current rate limits?"
 *
 * It also exposes middleware-friendly methods for HTTP request throttling.
 */

import type {
  LlmProvider,
  ThrottleDecision,
  ThrottleAction,
  ProviderStatus,
  RateLimitStatus,
  RequestPriority,
  RateAwareModelOption,
  KeyStatus,
} from './types'
import { MODEL_PROVIDER_MAP, PROVIDER_QUOTAS } from './types'
import { PROVIDER_FALLBACK_ORDER } from './rotator'
import { getProviderUsage, getProviderCapacity, recordUsage, markProviderExhausted } from './tracker'
import {
  selectBestKey,
  resolveApiKey,
  exhaustKey,
  recordKeyUsage,
  resetExpiredKeys,
  getHealthyKeys,
  buildProviderPriority,
} from './rotator'

// ─── Priority → threshold mapping ───────────────────────────────────────

/**
 * How close to the limit we let requests through, per priority level.
 * 0.0 = reject at 0% usage, 1.0 = allow until 100% usage.
 */
const PRIORITY_THRESHOLDS: Record<RequestPriority, number> = {
  critical: 0.95, // Allow until 95% usage
  high: 0.85, // Allow until 85%
  normal: 0.7, // Allow until 70%
  background: 0.5, // Allow until 50% (queue the rest)
}

// ─── Downgrade paths ────────────────────────────────────────────────────

/**
 * When throttled, suggested cheaper model alternatives.
 */
const DOWNGRADE_PATHS: Record<string, string> = {
  'gpt-5': 'gpt-4o',
  'gpt-5-codex': 'gpt-4o',
  'gpt-5-pro': 'gpt-5-mini',
  'claude-opus-4-5': 'claude-sonnet-4-5',
  'claude-sonnet-4-5': 'claude-haiku-4-5',
  'gemini-2.5-pro': 'gemini-2.5-flash',
  'gemini-3-pro-preview': 'gemini-2.5-flash',
}

// ─── Manager Class ──────────────────────────────────────────────────────

export class RateLimitManager {
  private preferredProviders: LlmProvider[]

  constructor(preferredProviders?: LlmProvider[]) {
    this.preferredProviders = preferredProviders ?? [...PROVIDER_FALLBACK_ORDER]
    // Reset expired keys on initialization
    resetExpiredKeys().catch(() => {})
  }

  /**
   * Check if a request can proceed, and if so with what model.
   *
   * This is the main method the Smart Router calls.
   *
   * @param requestedModel - The model the router wants to use.
   * @param priority - Priority level of the request.
   * @param estimatedTokens - Estimated total tokens for this request.
   * @returns A throttle decision.
   */
  async checkRequest(
    requestedModel: string,
    priority: RequestPriority = 'normal',
    estimatedTokens: number = 4000,
  ): Promise<ThrottleDecision> {
    // 1. Find the provider for this model
    const provider = MODEL_PROVIDER_MAP[requestedModel]
    if (!provider) {
      // Unknown model — proceed with caution
      return {
        action: 'proceed',
        reason: 'Unknown model, allowing through.',
        providerStatus: await this.getProviderStatusSummary('openai'),
      }
    }

    // 2. Check provider capacity
    const capacity = await getProviderCapacity(provider)
    const threshold = PRIORITY_THRESHOLDS[priority]
    const requestRatio = capacity.requestsRemaining / Math.max(PROVIDER_QUOTAS[provider].maxRequestsPerWindow, 1)
    const tokenRatio = capacity.tokensRemaining / Math.max(PROVIDER_QUOTAS[provider].maxTokensPerWindow, 1)

    // 3. Is the provider completely exhausted?
    if (capacity.isExhausted || requestRatio <= 0 || tokenRatio <= 0) {
      // Try to rotate to another provider
      const rotated = await this.tryRotateProvider(requestedModel, provider, priority)
      if (rotated) return rotated

      // Mark provider as exhausted
      await markProviderExhausted(provider)

      // No fallback available — reject or downgrade
      return {
        action: priority === 'critical' ? 'downgrade' : 'reject',
        suggestedModel: this.findDowngradePath(requestedModel, provider),
        reason: `Provider ${provider} is exhausted. ${
          priority === 'critical' ? 'Try downgraded model.' : 'Try again later or use a different model.'
        }`,
        providerStatus: await this.getProviderStatusSummary(provider),
      }
    }

    // 4. Are we approaching the limit?
    const effectiveRatio = Math.min(requestRatio, tokenRatio)
    if (effectiveRatio < threshold) {
      // We're within safe limits — proceed
      return {
        action: 'proceed',
        reason: `Provider ${provider} has ${capacity.requestsRemaining} requests remaining.`,
        providerStatus: await this.getProviderStatusSummary(provider),
      }
    }

    // 5. We're over the threshold — throttle
    if (priority === 'critical') {
      // Critical requests always go through, but suggest downgrade
      return {
        action: 'proceed',
        reason: `Provider ${provider} is near capacity (${Math.round((1 - effectiveRatio) * 100)}% used). Critical request allowed.`,
        providerStatus: await this.getProviderStatusSummary(provider),
      }
    }

    if (priority === 'high') {
      // High priority: try rotation first, then proceed
      const rotated = await this.tryRotateProvider(requestedModel, provider, priority)
      if (rotated) return rotated

      return {
        action: 'proceed',
        reason: `Provider ${provider} is near capacity. High priority request allowed.`,
        providerStatus: await this.getProviderStatusSummary(provider),
      }
    }

    // Normal / Background: downgrade or delay
    const downgraded = this.findDowngradePath(requestedModel, provider)
    if (downgraded) {
      return {
        action: 'downgrade',
        suggestedModel: downgraded,
        reason: `Provider ${provider} is near capacity. Downgrading to ${downgraded}.`,
        providerStatus: await this.getProviderStatusSummary(provider),
      }
    }

    if (priority === 'background') {
      return {
        action: 'delay',
        waitMs: Math.min(capacity.windowResetInMs, 30_000),
        reason: `Provider ${provider} is near capacity. Background request delayed.`,
        providerStatus: await this.getProviderStatusSummary(provider),
      }
    }

    return {
      action: 'proceed',
      reason: `Provider ${provider} is near capacity but proceeding anyway.`,
      providerStatus: await this.getProviderStatusSummary(provider),
    }
  }

  /**
   * Try to rotate to a different provider for the same model family.
   */
  private async tryRotateProvider(
    requestedModel: string,
    currentProvider: LlmProvider,
    priority: RequestPriority,
  ): Promise<ThrottleDecision | null> {
    // Build a priority list that excludes the current exhausted provider
    const alternatives = this.preferredProviders.filter((p) => p !== currentProvider)
    const resolved = await resolveApiKey(alternatives)

    if (resolved) {
      // Find a model on the alternative provider with similar capability
      const altModel = this.findEquivalentModel(requestedModel, resolved.provider)
      if (altModel && altModel !== requestedModel) {
        return {
          action: 'downgrade',
          suggestedModel: altModel,
          reason: `Provider ${currentProvider} exhausted. Rotating to ${resolved.provider} using ${altModel}.`,
          providerStatus: await this.getProviderStatusSummary(resolved.provider),
        }
      }
    }
    return null
  }

  /**
   * Record that a request succeeded, updating usage and key stats.
   */
  async recordSuccess(params: {
    model: string
    inputTokens: number
    outputTokens: number
    keyId?: string
  }): Promise<void> {
    const provider = MODEL_PROVIDER_MAP[params.model]
    if (!provider) return

    await recordUsage({
      provider,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    })

    if (params.keyId) {
      await recordKeyUsage(params.keyId)
    }
  }

  /**
   * Record that a request failed with a rate limit error (429).
   */
  async recordRateLimitError(model: string, keyId?: string): Promise<void> {
    const provider = MODEL_PROVIDER_MAP[model]
    if (!provider) return

    await markProviderExhausted(provider)

    if (keyId) {
      const resetMinutes = this.getProviderResetMinutes(provider)
      await exhaustKey(keyId, resetMinutes)
    }
  }

  /**
   * Get a comprehensive rate limit status for all providers.
   */
  async getStatus(): Promise<RateLimitStatus> {
    const providers = {} as Record<LlmProvider, ProviderStatus>
    let totalRemaining = 0
    let total = 0

    for (const provider of PROVIDER_FALLBACK_ORDER) {
      const status = await this.getProviderStatusSummary(provider)
      providers[provider] = status
      const maxReq = PROVIDER_QUOTAS[provider]?.maxRequestsPerWindow ?? 500
      totalRemaining += status.requestsRemaining
      total += maxReq
    }

    return {
      allowed: totalRemaining > 0,
      remaining: totalRemaining,
      total,
      resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      providers,
    }
  }

  /**
   * Get available models with rate limit awareness for the Smart Router.
   */
  async getAvailableModels(): Promise<RateAwareModelOption[]> {
    const options: RateAwareModelOption[] = []
    const models = [
      { model: 'gpt-5', label: 'GPT-5' },
      { model: 'gpt-5-codex', label: 'GPT-5 Codex' },
      { model: 'gpt-5-pro', label: 'GPT-5 Pro' },
      { model: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { model: 'gpt-4o', label: 'GPT-4o' },
      { model: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { model: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
      { model: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { model: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
      { model: 'deepseek-chat', label: 'DeepSeek Chat' },
    ]

    for (const { model, label } of models) {
      const provider = MODEL_PROVIDER_MAP[model]
      if (!provider) continue

      const capacity = await getProviderCapacity(provider)
      options.push({
        model,
        label,
        isAvailable: !capacity.isExhausted && capacity.requestsRemaining > 0,
        provider,
        providerRequestsRemaining: capacity.requestsRemaining,
        unavailabilityReason: capacity.isExhausted
          ? `Provider ${provider} exhausted (resets in ${Math.round(capacity.windowResetInMs / 60000)}m)`
          : undefined,
      })
    }

    return options.sort((a, b) => b.providerRequestsRemaining - a.providerRequestsRemaining)
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async getProviderStatusSummary(provider: LlmProvider): Promise<ProviderStatus> {
    const [capacity, healthyKeys] = await Promise.all([getProviderCapacity(provider), getHealthyKeys(provider)])

    return {
      provider,
      requestsRemaining: capacity.requestsRemaining,
      tokensRemaining: capacity.tokensRemaining,
      healthyKeys: healthyKeys.length,
      totalKeys: healthyKeys.length, // best-effort
      windowResetInMs: Math.max(0, capacity.windowResetInMs),
    }
  }

  private findDowngradePath(model: string, _provider: LlmProvider): string | undefined {
    return DOWNGRADE_PATHS[model]
  }

  private findEquivalentModel(sourceModel: string, targetProvider: LlmProvider): string | undefined {
    // Simple heuristic: find any available model on the target provider
    const providerModels = Object.entries(MODEL_PROVIDER_MAP)
      .filter(([_, p]) => p === targetProvider)
      .map(([model]) => model)

    // Prefer "premium" model on the alternative provider
    if (targetProvider === 'anthropic') return 'claude-sonnet-4-5'
    if (targetProvider === 'openai') return 'gpt-4o'
    if (targetProvider === 'gemini') return 'gemini-2.5-flash'
    if (targetProvider === 'deepseek') return 'deepseek-chat'
    if (targetProvider === 'aigateway') return 'gpt-4o-mini'

    return providerModels[0]
  }

  private getProviderResetMinutes(provider: LlmProvider): number {
    switch (provider) {
      case 'openai':
      case 'anthropic':
        return 60 * 24 * 28 // ~monthly
      case 'gemini':
        return 60 * 24 // daily
      case 'deepseek':
        return 60 * 24 // daily
      case 'cursor':
        return 60 * 24 * 28 // monthly
      case 'aigateway':
        return 60 // 1 hour typical
    }
  }
}

// ─── Singleton for app-wide use ─────────────────────────────────────────

let globalManager: RateLimitManager | null = null

/**
 * Get or create the global RateLimitManager instance.
 */
export function getRateLimitManager(preferredProviders?: LlmProvider[]): RateLimitManager {
  if (!globalManager) {
    globalManager = new RateLimitManager(preferredProviders)
  }
  return globalManager
}

/**
 * Reset the global manager (useful for testing).
 */
export function resetRateLimitManager(): void {
  globalManager = null
}
