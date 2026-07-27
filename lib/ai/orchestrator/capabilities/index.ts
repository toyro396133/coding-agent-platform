import type { CapabilityLevel, ToolContext } from './types'
import { getEnabledPacks } from '../modes'
import { createWebTools } from './web-tools'
import { createPlanTools } from './plan-tools'
import { createSessionTools } from './session-tools'
import { createBackgroundTools } from './background'
import { createResearchTools } from './research-tools'

type ToolRegistry = Record<string, any>

const packLoaders: Record<string, (ctx: ToolContext) => ToolRegistry> = {
  web: (ctx) => createWebTools(ctx),
  plan: (ctx) => createPlanTools(ctx),
  session: (ctx) => createSessionTools(ctx),
  background: (ctx) => createBackgroundTools(ctx),
  research: (ctx) => createResearchTools(ctx),
}

export function loadCapabilityTools(level: CapabilityLevel, context: ToolContext): ToolRegistry {
  const packs = getEnabledPacks(level)
  const tools: ToolRegistry = {}

  for (const packName of packs) {
    const loader = packLoaders[packName]
    if (loader) {
      Object.assign(tools, loader(context))
    }
  }

  return tools
}
