import { describe, expect, it } from 'vitest'
import type { RoutingResult } from '@/lib/ai/router'
import {
  assembleSystemPrompt,
  buildAutonomyInstructions,
  buildBaseSystemPrompt,
  buildModeInstructions,
} from './prompt-assembler'

const baseRouting: RoutingResult = {
  category: 'complex_code',
  model: 'claude-sonnet-4-5',
  systemPrompt: '',
  complexity: 6,
  techStack: ['react', 'typescript'],
}

describe('PromptAssembler', () => {
  it('builds mode instructions per capability level', () => {
    expect(buildModeInstructions('enhanced')).toContain('ENHANCED mode')
    expect(buildModeInstructions('auto')).toContain('AUTO mode')
    expect(buildModeInstructions('basic')).toBe('')
  })

  it('builds autonomy instructions per level', () => {
    expect(buildAutonomyInstructions('full')).toContain('FULL AUTONOMY')
    expect(buildAutonomyInstructions('autonomous')).toContain('AUTONOMOUS MODE')
    expect(buildAutonomyInstructions('guided')).toContain('GUIDED MODE')
  })

  it('injects routing context into the base prompt', () => {
    const prompt = buildBaseSystemPrompt(baseRouting)
    expect(prompt).toContain('Orchestrator Agent')
    expect(prompt).toContain('Task complexity: 6/10')
    expect(prompt).toContain('react')
  })

  it('appends the autonomous full-stack block for high-complexity tasks', () => {
    const prompt = buildBaseSystemPrompt({ ...baseRouting, complexity: 7 })
    expect(prompt).toContain('AUTONOMOUS FULL-STACK MODE')
  })

  it('omits the autonomous block for simple tasks', () => {
    const prompt = buildBaseSystemPrompt({ ...baseRouting, complexity: 3 })
    expect(prompt).not.toContain('AUTONOMOUS FULL-STACK MODE')
  })

  it('prefers a custom system prompt over the default', () => {
    const prompt = buildBaseSystemPrompt(baseRouting, 'CUSTOM SYSTEM PROMPT')
    expect(prompt).toContain('CUSTOM SYSTEM PROMPT')
    expect(prompt).not.toContain('Orchestrator Agent')
  })

  it('assembles all six sources in the fixed order', () => {
    const prompt = assembleSystemPrompt({
      baseSystemPrompt: '[base]',
      modeInstructions: '[mode]',
      rulesText: '[rules]',
      taskQueueAwareness: '[queue]',
      autonomyInstructions: '[autonomy]',
      repoMapContext: '[map]',
    })
    expect(prompt).toBe('[base][mode][rules][queue][autonomy][map]')
  })
})
