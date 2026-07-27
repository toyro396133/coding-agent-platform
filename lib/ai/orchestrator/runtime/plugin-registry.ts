import type { ToolContext } from '../capabilities/types'
import type { PluginManifest, Plugin } from '@/lib/plugins/types'

type ToolRegistry = Record<string, any>
type PackLoader = (ctx: ToolContext) => ToolRegistry

interface RegisteredPack {
  name: string
  loader: PackLoader
  source: string
}

const registeredPacks = new Map<string, RegisteredPack>()
const externalPlugins = new Map<string, Plugin>()
const pluginHooks = new Map<string, Map<string, (...args: unknown[]) => unknown>>()

export function registerPack(name: string, loader: PackLoader, source: string = 'built-in'): void {
  if (registeredPacks.has(name)) {
    return
  }
  registeredPacks.set(name, { name, loader, source })
}

export function unregisterPack(name: string): boolean {
  registeredPacks.delete(name)
  externalPlugins.delete(name)
  pluginHooks.delete(name)
  return true
}

export function getRegisteredPack(name: string): RegisteredPack | undefined {
  return registeredPacks.get(name)
}

export function listRegisteredPacks(): RegisteredPack[] {
  return Array.from(registeredPacks.values())
}

export function loadPackTools(name: string, ctx: ToolContext): ToolRegistry {
  const pack = registeredPacks.get(name)
  if (!pack) return {}
  return pack.loader(ctx)
}

export function loadPacksTools(names: string[], ctx: ToolContext): ToolRegistry {
  const tools: ToolRegistry = {}
  for (const name of names) {
    Object.assign(tools, loadPackTools(name, ctx))
  }
  return tools
}

export function registerExternalPlugin(manifest: PluginManifest): boolean {
  if (externalPlugins.has(manifest.name)) {
    return false
  }

  const plugin: Plugin = {
    manifest,
    enabled: true,
    loaded: false,
  }

  externalPlugins.set(manifest.name, plugin)
  pluginHooks.set(manifest.name, new Map())
  return true
}

export function unregisterExternalPlugin(name: string): boolean {
  externalPlugins.delete(name)
  pluginHooks.delete(name)
  return true
}

export function listExternalPlugins(): Plugin[] {
  return Array.from(externalPlugins.values())
}

export function setPluginEnabled(name: string, enabled: boolean): boolean {
  const plugin = externalPlugins.get(name)
  if (!plugin) return false
  plugin.enabled = enabled
  return true
}

export function registerPluginHook(
  pluginName: string,
  hookName: string,
  handler: (...args: unknown[]) => unknown,
): boolean {
  const hooks = pluginHooks.get(pluginName)
  if (!hooks) return false
  hooks.set(hookName, handler)
  return true
}

export function runPluginHooks(hookName: string, ...args: unknown[]): unknown[] {
  const results: unknown[] = []
  for (const [pluginName, hooks] of pluginHooks) {
    const plugin = externalPlugins.get(pluginName)
    if (!plugin || !plugin.enabled) continue

    const handler = hooks.get(hookName)
    if (handler) {
      try {
        results.push(handler(...args))
      } catch (error) {
        console.error(`Plugin hook error [${pluginName}:${hookName}]:`, error)
      }
    }
  }
  return results
}
