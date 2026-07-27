### Task 3: Create Orchestrator Tools

**Files:**
- Create: `lib/ai/orchestrator/tools.ts`

**Interfaces:**
- Consumes: `OrchestratorState` from task 2
- Produces: tool definitions for Vercel AI SDK `tool()`

- [ ] **Step 1: Create tools file**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { OrchestratorState } from './state'

export function createOrchestratorTools(state: OrchestratorState) {
  return {
    spawnSubAgent: tool({
      description: 'Spawn a specialized sub-agent for a specific sub-task.',
      parameters: z.object({
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
      parameters: z.object({
        subTasks: z.array(z.object({
          type: z.string(),
          prompt: z.string(),
        })).describe('Array of sub-tasks to execute in parallel.'),
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
      parameters: z.object({
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
```

- [ ] **Step 2: Run formatting and type-check**

```bash
pnpm format
pnpm type-check
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/tools.ts
git commit -m "Create orchestrator tool definitions"
```