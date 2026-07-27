### Task 2: Create Orchestrator State Manager

**Files:**
- Create: `lib/ai/orchestrator/state.ts`

**Interfaces:**
- Consumes: Task type (from schema.ts), LogEntry type
- Produces: `OrchestratorState` class with `saveCheckpoint()`, `getResult()`

- [ ] **Step 1: Create file with OrchestratorState class**

```typescript
import { generateId } from '@/lib/utils/id'

export interface SubAgentResult {
  type: string
  prompt: string
  result: string
}

export interface OrchestratorResult {
  finalAnswer: string
  steps: number
  subAgentResults: SubAgentResult[]
}

export class OrchestratorState {
  public steps = 0
  public maxSteps: number
  public currentPrompt: string
  public accumulatedContext = ''
  public completed = false
  public subAgentResults: SubAgentResult[] = []
  public taskId: string
  private checkpointFrequency: number

  constructor(taskId: string, initialPrompt: string, maxSteps = 20, checkpointFrequency = 5) {
    this.taskId = taskId
    this.currentPrompt = initialPrompt
    this.maxSteps = maxSteps
    this.checkpointFrequency = checkpointFrequency
  }

  addSubAgentResult(type: string, prompt: string, result: string): void {
    this.subAgentResults.push({ type, prompt, result })
  }

  appendContext(context: string): void {
    this.accumulatedContext += context + '\n'
  }

  markCompleted(): void {
    this.completed = true
  }

  shouldCheckpoint(): boolean {
    return this.steps > 0 && this.steps % this.checkpointFrequency === 0
  }

  getResult(): OrchestratorResult {
    return {
      finalAnswer: this.accumulatedContext || this.currentPrompt,
      steps: this.steps,
      subAgentResults: this.subAgentResults,
    }
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
git add lib/ai/orchestrator/state.ts
git commit -m "Create OrchestratorState manager"
```