'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { quickCostEstimate, getCostLevelInfo } from '@/lib/sandbox/cost-estimator'
import { Info, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react'

interface CostEstimationProps {
  prompt: string
  selectedModel: string
  className?: string
}

/**
 * Cost Estimation UI Component.
 * Shows estimated API costs for a task before execution.
 * Helps users understand token consumption and make cost-aware decisions.
 */
export function CostEstimation({ prompt, selectedModel, className }: CostEstimationProps) {
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setAnimateIn(true), 200)
    return () => clearTimeout(timer)
  }, [])

  const estimation = useMemo(() => {
    if (!prompt.trim() || !selectedModel) return null
    return quickCostEstimate(prompt, selectedModel)
  }, [prompt, selectedModel])

  if (!estimation) return null

  const costInfo = getCostLevelInfo(estimation.costLevel)

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all duration-500',
        animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        costInfo.color,
        className,
      )}
    >
      <span>{costInfo.icon}</span>
      <span className={cn('font-medium', costInfo.color)}>{estimation.estimatedCost}</span>
      <span className="text-muted-foreground">· {costInfo.label}</span>

      {/* Token-saving tip for expensive prompts */}
      {estimation.costLevel === 'expensive' && (
        <span className="text-amber-500 flex items-center gap-1 ml-auto">
          <AlertTriangle className="h-3 w-3" />
          <span className="hidden sm:inline">Consider a shorter prompt for lower cost</span>
        </span>
      )}

      {/* Efficiency tip for cheap models */}
      {estimation.costLevel === 'free' && (
        <span className="text-emerald-500 flex items-center gap-1 ml-auto">
          <TrendingUp className="h-3 w-3" />
          <span className="hidden sm:inline">Free tier eligible</span>
        </span>
      )}

      {/* Show info about more expensive models */}
      {estimation.costLevel === 'moderate' && (
        <span className="text-muted-foreground flex items-center gap-1 ml-auto">
          <Info className="h-3 w-3" />
          <span className="hidden sm:inline">Single turn estimate</span>
        </span>
      )}
    </div>
  )
}

/**
 * Token usage badge for displaying in task details.
 */
export function TokenUsageBadge({ tokenCount, className }: { tokenCount?: number; className?: string }) {
  if (!tokenCount) return null

  const displayToken = tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}K` : `${tokenCount}`

  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[10px] text-muted-foreground', className)}
      title={`${tokenCount} tokens used`}
    >
      <DollarSign className="h-2.5 w-2.5" />
      {displayToken} tokens
    </span>
  )
}
