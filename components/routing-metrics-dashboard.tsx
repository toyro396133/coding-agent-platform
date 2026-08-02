'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Zap,
  BrainCircuit,
  Layers,
  TrendingUp,
  RefreshCw,
  Activity,
  PieChart,
  Database,
  Gauge,
  XCircle,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────

interface RoutingMetricsData {
  totalCalls: number
  fastPath: number
  llmPath: number
  cacheHits: number
  rateLimited: number
  cacheSize: number
  byCategory: Record<string, number>
  byModel: Record<string, number>
  avgConfidence: number
}

interface CacheStats {
  hits: number
  misses: number
  size: number
  ttlMs: number
  maxEntries: number
}

interface MetricsSnapshot {
  routing: RoutingMetricsData
  cache: CacheStats
}

// ─── Color palette for categories ─────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  web_search: 'bg-sky-500',
  documentation: 'bg-violet-500',
  simple_code: 'bg-emerald-500',
  complex_code: 'bg-amber-500',
  refactor: 'bg-rose-500',
  debug: 'bg-red-500',
  code_review: 'bg-cyan-500',
  planning: 'bg-indigo-500',
  research: 'bg-fuchsia-500',
}

const CATEGORY_LABELS: Record<string, string> = {
  web_search: 'Web Search',
  documentation: 'Documentation',
  simple_code: 'Simple Code',
  complex_code: 'Complex Code',
  refactor: 'Refactor',
  debug: 'Debug',
  code_review: 'Code Review',
  planning: 'Planning',
  research: 'Research',
}

// ─── Stat card ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sublabel,
  color,
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sublabel?: string
  color: string
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-200 hover:shadow-md hover:border-foreground/20">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground/70">{sublabel}</p>}
        </div>
        <div className={cn('rounded-lg p-2', color)}>{icon}</div>
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
          {trend === 'down' && <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />}
          {trend === 'neutral' && <Activity className="h-3 w-3 text-muted-foreground" />}
        </div>
      )}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────

function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Mini ring chart ──────────────────────────────────────────────────

function CategoryRing({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">No data yet</div>
  }

  const sorted = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center">
        <div className="relative h-28 w-28">
          {/* Simple stacked ring representation using bars */}
          <div className="absolute inset-0 rounded-full border-4 border-muted" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold">{total}</span>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {sorted.slice(0, 5).map(([cat, val]) => {
          const pct = total > 0 ? Math.round((val / total) * 100) : 0
          return (
            <div key={cat} className="flex items-center gap-2 text-xs">
              <span className={cn('h-2 w-2 rounded-full flex-shrink-0', CATEGORY_COLORS[cat] || 'bg-muted')} />
              <span className="flex-1 text-muted-foreground truncate">{CATEGORY_LABELS[cat] || cat}</span>
              <span className="font-medium">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────

async function loadRoutingMetrics(): Promise<MetricsSnapshot> {
  const res = await fetch('/api/metrics/routing')
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('unauthorized')
    }
    throw new Error('fetch-failed')
  }
  return res.json()
}

function metricsErrorMessage(err: unknown): string {
  return err instanceof Error && err.message === 'unauthorized' ? 'Sign in required' : 'Failed to load metrics'
}

export function RoutingMetricsDashboard({ className }: { className?: string }) {
  const [data, setData] = useState<MetricsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [animateIn, setAnimateIn] = useState(false)

  const fetchMetrics = useCallback(async () => {
    try {
      const json = await loadRoutingMetrics()
      setData(json)
      setError(null)
    } catch (err) {
      setError(metricsErrorMessage(err))
    } finally {
      setAnimateIn(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    loadRoutingMetrics()
      .then((json) => {
        if (!ignore) {
          setData(json)
          setError(null)
        }
      })
      .catch((err) => {
        if (!ignore) setError(metricsErrorMessage(err))
      })
      .finally(() => {
        if (!ignore) {
          setAnimateIn(true)
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const { routing, cache } = data ?? {
    routing: {
      totalCalls: 0,
      fastPath: 0,
      llmPath: 0,
      cacheHits: 0,
      rateLimited: 0,
      cacheSize: 0,
      byCategory: {},
      byModel: {},
      avgConfidence: 0,
    },
    cache: { hits: 0, misses: 0, size: 0, ttlMs: 0, maxEntries: 0 },
  }

  const fastPct = routing.totalCalls > 0 ? Math.round((routing.fastPath / routing.totalCalls) * 100) : 0
  const llmPct = routing.totalCalls > 0 ? Math.round((routing.llmPath / routing.totalCalls) * 100) : 0
  const cacheHitPct = routing.llmPath > 0 ? Math.round((routing.cacheHits / routing.llmPath) * 100) : 0
  const cacheEfficiency =
    cache.hits + cache.misses > 0 ? Math.round((cache.hits / (cache.hits + cache.misses)) * 100) : 0

  return (
    <div
      className={cn(
        'space-y-6 transition-all duration-500',
        animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        className,
      )}
    >
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Router Metrics</h2>
          {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <button
          onClick={() => {
            setLoading(true)
            void fetchMetrics()
          }}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <XCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      ) : (
        <>
          {/* Key stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Gauge className="h-4 w-4 text-white" />}
              label="Total Routes"
              value={routing.totalCalls}
              sublabel={`${fastPct}% fast, ${llmPct}% LLM`}
              color="bg-indigo-500"
            />
            <StatCard
              icon={<Zap className="h-4 w-4 text-white" />}
              label="Fast Path (Keyword)"
              value={routing.fastPath}
              sublabel={`${fastPct}% of total`}
              color="bg-emerald-500"
            />
            <StatCard
              icon={<BrainCircuit className="h-4 w-4 text-white" />}
              label="LLM Path"
              value={routing.llmPath}
              sublabel={`${cacheHitPct}% cached`}
              color="bg-amber-500"
            />
            <StatCard
              icon={<Layers className="h-4 w-4 text-white" />}
              label="Avg Confidence"
              value={routing.avgConfidence.toFixed(2)}
              sublabel="0–1 scale"
              color="bg-violet-500"
            />
          </div>

          {/* Efficiency breakdown */}
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Efficiency Breakdown
            </h3>
            <div className="space-y-3">
              <ProgressBar
                value={routing.fastPath}
                max={routing.totalCalls || 1}
                color="bg-emerald-500"
                label="Fast path (keyword)"
              />
              <ProgressBar
                value={routing.llmPath}
                max={routing.totalCalls || 1}
                color="bg-amber-500"
                label="LLM-enhanced path"
              />
              <ProgressBar
                value={routing.cacheHits}
                max={routing.llmPath || 1}
                color="bg-sky-500"
                label="Cache hits (LLM API calls avoided)"
              />
              <ProgressBar
                value={routing.rateLimited}
                max={routing.totalCalls || 1}
                color="bg-red-500"
                label="Rate-limited downgrades"
              />
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category breakdown */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <PieChart className="h-3 w-3" />
                By Category
              </h3>
              <CategoryRing data={routing.byCategory} />
            </div>

            {/* Cache stats */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Database className="h-3 w-3" />
                Cache Performance
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Efficiency</span>
                  <span className="font-medium">{cacheEfficiency}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${cacheEfficiency}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-lg font-bold">{cache.hits}</p>
                    <p className="text-[10px] text-muted-foreground">Hits</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-lg font-bold">{cache.misses}</p>
                    <p className="text-[10px] text-muted-foreground">Misses</p>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t">
                  <p>
                    Entries: {cache.size} / {cache.maxEntries}
                  </p>
                  <p>TTL: {(cache.ttlMs / 1000 / 60).toFixed(0)} min</p>
                </div>
              </div>
            </div>
          </div>

          {/* Top models */}
          {Object.keys(routing.byModel).length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" />
                Top Models
              </h3>
              <div className="space-y-1.5">
                {Object.entries(routing.byModel)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([model, count]) => {
                    const pct = routing.totalCalls > 0 ? Math.round((count / routing.totalCalls) * 100) : 0
                    return (
                      <div key={model} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-muted-foreground truncate font-mono">{model}</span>
                        <span className="font-medium w-8 text-right">{count}</span>
                        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
