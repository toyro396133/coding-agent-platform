import { tool } from 'ai'
import { z } from 'zod'
import type { OrchestratorState } from './state'

export function createOrchestratorTools(state: OrchestratorState) {
  return {
    spawnSubAgent: tool({
      description: 'Spawn a specialized sub-agent for a specific sub-task.',
      inputSchema: z.object({
        subTaskType: z.string().describe('Identifier for the sub-task (e.g., "css_specialist", "api_reader")'),
        prompt: z.string().describe('The specific assignment for this sub-agent.'),
      }),
      execute: async ({ subTaskType, prompt }) => {
        state.addSubAgentResult(subTaskType, prompt, '')
        return `Sub-agent "${subTaskType}" has been noted. Results will be incorporated.`
      },
    }),

    spawnSubAgents: tool({
      description: 'Spawn multiple specialized sub-agents in parallel.',
      inputSchema: z.object({
        subTasks: z
          .array(
            z.object({
              type: z.string(),
              prompt: z.string(),
            }),
          )
          .describe('Array of sub-tasks to execute in parallel.'),
      }),
      execute: async ({ subTasks }) => {
        for (const st of subTasks) {
          state.addSubAgentResult(st.type, st.prompt, '')
        }
        const summary = subTasks.map((st) => `"${st.type}"`).join(', ')
        return `Spawned ${subTasks.length} sub-agents in parallel: ${summary}.`
      },
    }),

    finalize: tool({
      description: 'Call when you have all the information needed. Provide the final synthesized answer.',
      inputSchema: z.object({
        answer: z.string().describe('The final answer or refined prompt for the task.'),
      }),
      execute: async ({ answer }) => {
        state.appendContext(answer)
        state.markCompleted()
        return 'Final answer recorded.'
      },
    }),
  }
}
