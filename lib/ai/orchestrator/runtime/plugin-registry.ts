import type { ToolContext } from '../capabilities/types'

type ToolRegistry = Record<string, any>
type PackLoader = (ctx: ToolContext) => ToolRegistry

interface RegisteredPack {
  name: string
  loader: PackLoader
  source: string
}

const registeredPacks = new Map<string, RegisteredPack>()

export function registerPack(name: string, loader: PackLoader, source: string = 'built-in'): void {
  if (registeredPacks.has(name)) {
    throw new Error(`Pack "${name}" is already registered from ${registeredPacks.get(name)!.source}`)
  }
  registeredPacks.set(name, { name, loader, source })
}

export function unregisterPack(name: string): boolean {
  return registeredPacks.delete(name)
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
