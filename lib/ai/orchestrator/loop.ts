import { generateText, stepCountIs } from 'ai'
import { getModelClient } from '@/lib/ai/models'
import { OrchestratorState, type OrchestratorResult } from './state'
import { createOrchestratorTools } from './tools'

interface RunOrchestratorOptions {
  taskId: string
  selectedModel?: string
  systemPrompt?: string
  maxSteps?: number
}

export async function runOrchestrator(prompt: string, options: RunOrchestratorOptions): Promise<OrchestratorResult> {
  const state = new OrchestratorState(options.taskId, prompt, options.maxSteps || 20)

  const model = getModelClient(options.selectedModel || 'gpt-4o-mini')
  const systemPrompt =
    options.systemPrompt ||
    'You are the Orchestrator Agent. Analyze the task below. If it is complex, spawn sub-agents using the available tools. Once you have all necessary results, call `finalize` with your synthesized answer or refined prompt. Keep your answer concise and actionable.'

  while (state.steps < state.maxSteps && !state.completed) {
    const tools = createOrchestratorTools(state)

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: state.currentPrompt,
        tools,
        stopWhen: stepCountIs(1),
      })

      if (text) {
        state.appendContext(text)
      }
    } catch (error) {
      state.appendContext(`Error during generation: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
