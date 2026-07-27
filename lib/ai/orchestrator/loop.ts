import { generateText, stepCountIs } from 'ai'
import { getModelClient } from '@/lib/ai/models'
import { OrchestratorState, type OrchestratorResult } from './state'
import { createOrchestratorTools } from './tools'
import { loadCapabilityTools } from './capabilities/index'
import { getModeConfig } from './modes'
import type { CapabilityLevel } from './capabilities/types'

interface RunOrchestratorOptions {
  taskId: string
  userId?: string
  selectedModel?: string
  systemPrompt?: string
  maxSteps?: number
  capabilityLevel?: CapabilityLevel
}

export async function runOrchestrator(prompt: string, options: RunOrchestratorOptions): Promise<OrchestratorResult> {
  const state = new OrchestratorState(options.taskId, prompt, options.maxSteps || 20)

  const level = options.capabilityLevel || 'basic'
  state.capabilityLevel = level
  if (options.userId && level !== 'basic') {
    state.setCapabilityLevel(level, options.userId)
  }

  const model = getModelClient(options.selectedModel || 'gpt-4o-mini')

  const config = getModeConfig(level)
  let modeInstructions = ''
  if (level === 'enhanced') {
    modeInstructions = '\nYou are in enhanced mode with additional capabilities: web search, planning, file tools, shell tools, LSP, browser, research, session management, and background tasks. Use these tools when appropriate.'
  } else if (level === 'auto') {
    modeInstructions = '\nYou are in auto mode. You start with session and background tools, and can escalate to additional capabilities as needed based on task complexity.'
  }

  const systemPrompt =
    (options.systemPrompt ||
      'You are the Orchestrator Agent. Analyze the task below. If it is complex, spawn sub-agents using the available tools. Once you have all necessary results, call `finalize` with your synthesized answer or refined prompt. Keep your answer concise and actionable.') +
    modeInstructions

  while (state.steps < state.maxSteps && !state.completed) {
    const legacyTools = createOrchestratorTools(state)
    let allTools = { ...legacyTools }

    if (level !== 'basic' && state.toolContext) {
      const capTools = loadCapabilityTools(level, state.toolContext)
      allTools = { ...allTools, ...capTools }
    }

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: state.currentPrompt,
        tools: allTools,
        stopWhen: stepCountIs(1),
      })

      if (text) {
        state.appendContext(text)
      }
    } catch (error) {
      state.appendContext('Error during generation')
    }

    state.steps++

    if (state.completed) {
      break
    }

    if (state.shouldCheckpoint()) {
      state.saveCheckpoint()
    }
  }

  return state.getResult()
}
