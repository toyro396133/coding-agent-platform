### Task 4: Create Orchestrator Loop

**Files:**
- Create: `lib/ai/orchestrator/loop.ts`

**Interfaces:**
- Consumes: `OrchestratorState`, `OrchestratorResult` from task 2; `createOrchestratorTools` from task 3; `getModelClient` from `lib/ai/models.ts`
- Produces: `runOrchestrator(prompt, options)` function

- [ ] **Step 1: Create the loop file**

```typescript
import { generateText } from 'ai'
import { getModelClient } from '@/lib/ai/models'
import { OrchestratorState, type OrchestratorResult } from './state'
import { createOrchestratorTools } from './tools'

interface RunOrchestratorOptions {
  taskId: string
  selectedModel?: string
  systemPrompt?: string
  maxSteps?: number
}

export async function runOrchestrator(
  prompt: string,
  options: RunOrchestratorOptions,
): Promise<OrchestratorResult> {
  const state = new OrchestratorState(
    options.taskId,
    prompt,
    options.maxSteps || 20,
  )

  const model = getModelClient(options.selectedModel || 'gpt-4o-mini')
  const systemPrompt =
    options.systemPrompt ||
    'You are the Orchestrator Agent. Analyze the task below. If it is complex, spawn sub-agents using the available tools. Once you have all necessary results, call `finalize` with your synthesized answer or refined prompt. Keep your answer concise and actionable.'

  while (state.steps < state.maxSteps && !state.completed) {
    const tools = createOrchestratorTools(state)

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: state.currentPrompt,
      tools,
      maxSteps: 1,
    })

    if (text) {
      state.appendContext(text)
    }

    state.steps++

    if (state.completed) {
      break
    }
  }

  return state.getResult()
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
git add lib/ai/orchestrator/loop.ts
git commit -m "Create orchestrator loop with extended tools"
```