import type { CapabilityLevel, ToolContext } from './types'
import { getEnabledPacks } from '../modes'
import { createWebTools } from './web-tools'
import { createPlanTools } from './plan-tools'
import { createSessionTools } from './session-tools'
import { createBackgroundTools } from './background'
import { createResearchTools } from './research-tools'
import { createFileTools } from './file-tools'
import { createShellTools } from './shell-tools'
import { createLspTools } from './lsp-tools'
import { createBrowserTools } from './browser-tools'
import { registerPack, loadPacksTools } from '../runtime/plugin-registry'

type ToolRegistry = Record<string, any>

const builtInLoaders: Record<string, (ctx: ToolContext) => ToolRegistry> = {
  web: (ctx) => createWebTools(ctx),
  plan: (ctx) => createPlanTools(ctx),
  session: (ctx) => createSessionTools(ctx),
  background: (ctx) => createBackgroundTools(ctx),
  research: (ctx) => createResearchTools(ctx),
  file: (ctx) => createFileTools(ctx),
  shell: (ctx) => createShellTools(ctx),
  lsp: (ctx) => createLspTools(ctx),
  browser: (ctx) => createBrowserTools(ctx),
}

for (const [name, loader] of Object.entries(builtInLoaders)) {
  registerPack(name, loader)
}

export function loadCapabilityTools(level: CapabilityLevel, context: ToolContext): ToolRegistry {
  const packs = getEnabledPacks(level)
  return loadPacksTools(packs, context)
}
