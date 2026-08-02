import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_PRICING,
  getModelPricing,
  MODEL_PRICING,
  MODEL_PROVIDER_MAP,
  MODEL_TIERS,
} from './model-registry'

describe('Model Registry', () => {
  it('every tier model resolves to a provider', () => {
    const tierModels = [...MODEL_TIERS.fast, ...MODEL_TIERS.balanced, ...MODEL_TIERS.powerful]
    for (const model of tierModels) {
      expect(MODEL_PROVIDER_MAP[model], `no provider for ${model}`).toBeTruthy()
    }
  })

  it('every priced model resolves to a provider (no orphan pricing rows)', () => {
    for (const model of Object.keys(MODEL_PRICING)) {
      expect(MODEL_PROVIDER_MAP[model], `priced but no provider: ${model}`).toBeTruthy()
    }
  })

  it('falls back to defaults for unknown models', () => {
    expect(getModelPricing('totally-unknown-model')).toEqual(DEFAULT_MODEL_PRICING)
    expect(getModelPricing('unknown-model').input).toBe(DEFAULT_MODEL_PRICING.input)
  })

  it('returns pricing for a known model', () => {
    expect(getModelPricing('gpt-5').input).toBeGreaterThan(0)
    expect(getModelPricing('claude-sonnet-4-5').output).toBeGreaterThan(0)
    expect(getModelPricing('gemini-2.5-flash').cacheRead).toBeGreaterThanOrEqual(0)
  })

  it('all pricing rows are non-negative', () => {
    for (const [model, p] of Object.entries(MODEL_PRICING)) {
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
        expect(p[key], `${model}.${key}`).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
