/**
 * Core types for the Rate Limit Manager.
 *
 * Tracks API usage across providers, rotates keys automatically,
 * and informs the Smart Router which models are available.
 */

// ─── Provider Identification ───────────────────────────────────────────

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
}

// ─── Usage Record ──────────────────────────────────────────────────────

export interface UsageRecord {
  /** Provider this record applies to */
  provider: LlmProvider
  /** Number of requests made since window start */
  requestCount: number
  /** Total input tokens used since window start */
  inputTokens: number
  /** Total output tokens used since window start */
  outputTokens: number
  /** Unix timestamp (ms) when current window started */
  windowStart: number
  /** Unix timestamp (ms) when current window resets */
  windowResetAt: number
  /** Whether all keys for this provider are currently exhausted */
  isExhausted: boolean
  /** ISO date string of the quota window day (daily/monthly) */
  quotaWindowDay: string
}

// ─── Key Status ─────────────────────────────────────────────────────────

export interface KeyStatus {
  /** Unique key ID */
  id: string
  /** Human label (e.g. "primary", "backup") */
  label: string
  /** Provider this key belongs to */
  provider: LlmProvider
  /** Whether this key is currently usable */
  healthy: boolean
  /** How many requests this key has served */
  usageCount: number
  /** When this key was last used */
  lastUsedAt: Date | null
  /** If exhausted, when it's expected to reset */
  exhaustedAt: Date | null
  /** Provider-specific quota reset interval in minutes */
  quotaResetMinutes: number | null
}

// ─── Throttle Decision ──────────────────────────────────────────────────

export type ThrottleAction = 'proceed' | 'delay' | 'downgrade' | 'reject'

export interface ThrottleDecision {
  /** What to do with this request */
  action: ThrottleAction
  /** If delay: how many ms to wait before proceeding */
  waitMs?: number
  /** If downgrade: what model to use instead */
  suggestedModel?: string
  /** Human-readable reason */
  reason: string
  /** Current provider status snapshot */
  providerStatus: ProviderStatus
}

export interface ProviderStatus {
  provider: LlmProvider
  requestsRemaining: number
  tokensRemaining: number
  healthyKeys: number
  totalKeys: number
  windowResetInMs: number
}

// ─── Provider Quota Config ──────────────────────────────────────────────

export interface ProviderQuotaConfig {
  /** Max requests per window for this provider */
  maxRequestsPerWindow: number
  /** Max total tokens (input + output) per window */
  maxTokensPerWindow: number
  /** Window duration in minutes */
  windowMinutes: number
  /** Whether this is a custom user key (vs. platform-provided) */
  isUserKey: boolean
}

/** Default quotas */
export const PROVIDER_QUOTAS: Record<LlmProvider, ProviderQuotaConfig> = {
  openai: { maxRequestsPerWindow: 500, maxTokensPerWindow: 200_000_000, windowMinutes: 1440, isUserKey: false },
  anthropic: { maxRequestsPerWindow: 400, maxTokensPerWindow: 160_000_000, windowMinutes: 1440, isUserKey: false },
  gemini: { maxRequestsPerWindow: 1500, maxTokensPerWindow: 100_000_000, windowMinutes: 1440, isUserKey: false },
  cursor: { maxRequestsPerWindow: 300, maxTokensPerWindow: 50_000_000, windowMinutes: 1440, isUserKey: false },
  deepseek: { maxRequestsPerWindow: 500, maxTokensPerWindow: 100_000_000, windowMinutes: 1440, isUserKey: false },
  aigateway: { maxRequestsPerWindow: 1000, maxTokensPerWindow: 500_000_000, windowMinutes: 1440, isUserKey: false },
}

// ─── Rate Limit Status for API responses ───────────────────────────────

export interface RateLimitStatus {
  allowed: boolean
  remaining: number
  total: number
  resetAt: string
  /** Per-provider breakdown */
  providers: Record<LlmProvider, ProviderStatus>
}

// ─── Smart Router Enrichment ───────────────────────────────────────────

export interface RateAwareModelOption {
  model: string
  /** Human label for UI */
  label: string
  /** Whether this model is currently usable */
  isAvailable: boolean
  /** Provider that powers this model */
  provider: LlmProvider
  /** Provider's remaining request capacity */
  providerRequestsRemaining: number
  /** If unavailable, why */
  unavailabilityReason?: string
}

// ─── Priority levels for throttling ────────────────────────────────────

export type RequestPriority = 'critical' | 'high' | 'normal' | 'background'
