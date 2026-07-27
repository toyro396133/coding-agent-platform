import type { CapabilityLevel } from './capabilities/types'

export interface OrchestratorModeConfig {
  level: CapabilityLevel
  packs: string[]
  autoEscalate: boolean
}

const modeConfigs: Record<CapabilityLevel, OrchestratorModeConfig> = {
  basic: {
    level: 'basic',
    packs: [],
    autoEscalate: false,
  },
  enhanced: {
    level: 'enhanced',
    packs: ['web', 'plan', 'session', 'background', 'research', 'file', 'shell', 'lsp', 'browser'],
    autoEscalate: false,
  },
  auto: {
    level: 'auto',
    packs: ['session', 'background'],
    autoEscalate: true,
  },
}

export function getModeConfig(level: CapabilityLevel): OrchestratorModeConfig {
  return modeConfigs[level]
}

export function getEnabledPacks(level: CapabilityLevel): string[] {
  return modeConfigs[level].packs
}

export function shouldLoadPack(level: CapabilityLevel, packName: string): boolean {
  const config = modeConfigs[level]
  if (config.packs.includes(packName)) return true
  if (config.autoEscalate && packName !== 'session' && packName !== 'background') return true
  return false
}

export function suggestLevel(promptComplexity: number): CapabilityLevel {
  if (promptComplexity < 0.3) return 'basic'
  if (promptComplexity < 0.7) return 'enhanced'
  return 'auto'
}
