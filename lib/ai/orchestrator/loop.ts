import { generateText } from 'ai'
import { OrchestratorState } from './state'
import { createOrchestratorTools } from './tools'
import { getModelClient } from '@/lib/ai/models'

export interface RunOrchestratorOptions {
  taskId: string
  initialPrompt: string
  modelName?: string
  maxSteps?: number
  checkpointFrequency?: number
}

export async function runOrchestrator(options: RunOrchestratorOptions): Promise<OrchestratorResult> {
  const { taskId, initialPrompt, modelName = 'gpt-4o-mini', maxSteps = 20, checkpointFrequency = 5 } = options

  const state = new OrchestratorState(taskId, initialPrompt, maxSteps, checkpointFrequency)
  const model = getModelClient(modelName)
  const tools = createOrchestratorTools(state)

  while (!state.completed && state.steps < state.maxSteps) {
    state.steps++

    const prompt = state.currentPrompt + '\n\nContext:\n' + state.accumulatedContext

    const result = await generateText({
      model,
      prompt,
      tools,
    })

    if (state.shouldCheckpoint()) {
      state.saveCheckpoint()
    }
  }

  return state.getResult()
}

import type { OrchestratorResult } from './state'
