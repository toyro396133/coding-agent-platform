/**
 * router-metrics.ts — Tracks routing decisions for observability.
 *
 * Records every call to `routePrompt()` and `routePromptSync()`:
 *   - How many times the fast (keyword) path was sufficient
 *   - How many times the slow (LLM) path was needed
 *   - How many cache hits avoided an LLM call
 *   - How many rate-limited downgrades occurred
 *   - Breakdown by category (debug, planning, etc.)
 *   - Breakdown by model selection
 *
 * Metrics are in-memory only — they reset on server restart.
 */

import type { TaskCategory } from './router'

// ─── Types ─────────────────────────────────────────────────────────────

export interface RoutingMetricsData {
  /** Total routePrompt calls (includes both fast and slow paths) */
  totalCalls: number
  /** Calls where the fast keyword path had sufficient confidence */
  fastPath: number
  /** Calls where the LLM-enhanced path was needed */
  llmPath: number
  /**
   * Of the llmPath calls, how many hit the cache (avoided an LLM API call).
   * Also includes dedup hits where concurrent requests shared one in-flight promise.
   */
  cacheHits: number
  /** How many times the rate limiter downgraded or rejected a model */
  rateLimited: number
  /** How many cache entries are currently stored */
  cacheSize: number
  /** Per-category call count */
  byCategory: Record<TaskCategory, number>
  /** Per-model call count */
  byModel: Record<string, number>
  /** Average keyword confidence across all calls (0–100) */
  avgConfidence: number
}

export interface RouterMetricsSnapshot {
  routing: RoutingMetricsData
  cache: {
    hits: number
    misses: number
    size: number
    ttlMs: number
    maxEntries: number
  }
}

// ─── Metrics class ─────────────────────────────────────────────────────

export class RouterMetrics {
  private data: RoutingMetricsData = {
    totalCalls: 0,
    fastPath: 0,
    llmPath: 0,
    cacheHits: 0,
    rateLimited: 0,
    cacheSize: 0,
    byCategory: {
      web_search: 0,
      documentation: 0,
      simple_code: 0,
      complex_code: 0,
      refactor: 0,
      debug: 0,
      code_review: 0,
      planning: 0,
      research: 0,
    },
    byModel: {},
    avgConfidence: 0,
  }

  /** Accumulated confidence sum for computing the average (internal only) */
  private _confidenceSum = 0

  // ── Recording ───────────────────────────────────────────────────────

  /**
   * Record a routing call — fast path (keyword only).
   */
  recordFastPath(category: TaskCategory, model: string, confidence: number): void {
    this.data.totalCalls++
    this.data.fastPath++
    this.data.byCategory[category] = (this.data.byCategory[category] || 0) + 1
    this.data.byModel[model] = (this.data.byModel[model] || 0) + 1
    this._confidenceSum += confidence
    this.data.avgConfidence = this.calcAvgConfidence()
  }

  /**
   * Record a routing call — LLM-enhanced path.
   */
  recordLlmPath(category: TaskCategory, model: string, confidence: number, wasCached: boolean): void {
    this.data.totalCalls++
    this.data.llmPath++
    if (wasCached) this.data.cacheHits++
    this.data.byCategory[category] = (this.data.byCategory[category] || 0) + 1
    this.data.byModel[model] = (this.data.byModel[model] || 0) + 1
    this._confidenceSum += confidence
    this.data.avgConfidence = this.calcAvgConfidence()
  }

  /**
   * Record a rate-limited downgrade.
   */
  recordRateLimited(): void {
    this.data.rateLimited++
  }

  /**
   * Update the cache size snapshot.
   */
  updateCacheSize(size: number): void {
    this.data.cacheSize = size
  }

  // ── Snapshot ────────────────────────────────────────────────────────

  /**
   * Return a snapshot of current metrics.
   */
  snapshot(cacheStats?: {
    hits: number
    misses: number
    size: number
    ttlMs: number
    maxEntries: number
  }): RouterMetricsSnapshot {
    return {
      routing: {
        totalCalls: this.data.totalCalls,
        fastPath: this.data.fastPath,
        llmPath: this.data.llmPath,
        cacheHits: this.data.cacheHits,
        rateLimited: this.data.rateLimited,
        cacheSize: this.data.cacheSize,
        byCategory: { ...this.data.byCategory },
        byModel: { ...this.data.byModel },
        avgConfidence: this.data.avgConfidence,
      },
      cache: cacheStats ?? { hits: 0, misses: 0, size: 0, ttlMs: 0, maxEntries: 0 },
    }
  }

  /**
   * Reset all metrics to zero.
   */
  reset(): void {
    this.data = {
      totalCalls: 0,
      fastPath: 0,
      llmPath: 0,
      cacheHits: 0,
      rateLimited: 0,
      cacheSize: 0,
      byCategory: {
        web_search: 0,
        documentation: 0,
        simple_code: 0,
        complex_code: 0,
        refactor: 0,
        debug: 0,
        code_review: 0,
        planning: 0,
        research: 0,
      },
      byModel: {},
      avgConfidence: 0,
    }
    this._confidenceSum = 0
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private calcAvgConfidence(): number {
    if (this.data.totalCalls === 0) return 0
    return Math.round((this._confidenceSum / this.data.totalCalls) * 100) / 100
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────

let _metricsInstance: RouterMetrics | null = null

export function getRouterMetrics(): RouterMetrics {
  if (!_metricsInstance) {
    _metricsInstance = new RouterMetrics()
  }
  return _metricsInstance
}
