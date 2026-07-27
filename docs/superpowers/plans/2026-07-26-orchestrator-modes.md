# Orchestrator Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to choose between three execution modes — orchestrator + external agent, orchestrator only, or external agent only — when creating tasks.

**Architecture:** Add `execution_mode` column to tasks table; extract orchestrator from inline route.ts code into dedicated `lib/ai/orchestrator/` files with an extended tool set; conditionally skip orchestrator or external agent based on mode.

**Tech Stack:** Next.js, Drizzle ORM (PostgreSQL), shadcn/ui (Select), Vercel AI SDK (generateText)

## Global Constraints

- No dynamic values in logger calls (see AGENTS.md)
- Run `pnpm format`, `pnpm type-check`, `pnpm lint` after every task
- Execution mode enum: `orchestrator_external` | `orchestrator_only` | `external_only`
- Default execution mode: `orchestrator_external` (maintains current behavior)

---

### Task 1: Database Schema — Add `execution_mode` Column

**Files:**
- Modify: `lib/db/schema.ts` (lines 83-189)

**Interfaces:**
- Consumes: existing tasks table definition
- Produces: `executionMode` column + zod validation

- [ ] **Step 1: Add column to pgTable**

Add after `enableBrowser` in the tasks table definition:

```typescript
executionMode: text('execution_mode').default('orchestrator_external').notNull(),
```

- [ ] **Step 2: Add field to insertTaskSchema**

Add after the `enableBrowser` line:

```typescript
executionMode: z.enum(['orchestrator_external', 'orchestrator_only', 'external_only']).default('orchestrator_external'),
```

- [ ] **Step 3: Add field to selectTaskSchema**

Add after the `enableBrowser` line:

```typescript
executionMode: z.enum(['orchestrator_external', 'orchestrator_only', 'external_only']),
```

- [ ] **Step 4: Verify**

```bash
pnpm type-check
pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts
git commit -m "Add execution_mode column to tasks table"
```

---

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

---

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

---

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

---

### Task 5: API Route — Wire Execution Mode

**Files:**
- Modify: `app/api/tasks/route.ts`

**Interfaces:**
- Consumes: `executionMode` from request body; `runOrchestrator` from task 4
- Produces: conditional orchestrator + sandbox agent flow

- [ ] **Step 1: Pass executionMode through POST handler**

In the `after()` block call to `processTaskWithTimeout` (line 234), add `executionMode` as a new parameter after `enableBrowser`:

```typescript
after(async () => {
  try {
    await processTaskWithTimeout(
      session.user.id,
      newTask.id,
      validatedData.prompt,
      validatedData.repoUrl || '',
      validatedData.maxDuration || maxSandboxDuration,
      validatedData.selectedAgent || 'claude',
      validatedData.selectedModel,
      validatedData.installDependencies || false,
      validatedData.keepAlive || false,
      validatedData.enableBrowser || false,
      validatedData.executionMode || 'orchestrator_external',
      userApiKeys,
      userGithubToken,
      githubUser,
    )
  } catch (error) {
    console.error('Task processing failed:', error)
  }
})
```

- [ ] **Step 2: Update processTaskWithTimeout signature**

```typescript
async function processTaskWithTimeout(
  userId: string,
  taskId: string,
  prompt: string,
  repoUrl: string,
  maxDuration: number,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  keepAlive: boolean = false,
  enableBrowser: boolean = false,
  executionMode: string = 'orchestrator_external',
  apiKeys?: { ... },
  githubToken?: string | null,
  githubUser?: { ... } | null,
) {
```

- [ ] **Step 3: Pass executionMode through to processTask call**

In the `processTask` call inside `processTaskWithTimeout` (line 308), add `executionMode` after `enableBrowser`:

```typescript
await Promise.race([
  processTask(
    userId,
    taskId,
    prompt,
    repoUrl,
    maxDuration,
    selectedAgent,
    selectedModel,
    installDependencies,
    keepAlive,
    enableBrowser,
    executionMode,
    apiKeys,
    githubToken,
    githubUser,
  ),
  timeoutPromise,
])
```

- [ ] **Step 4: Update processTask signature**

```typescript
async function processTask(
  userId: string,
  taskId: string,
  prompt: string,
  repoUrl: string,
  maxDuration: number,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  keepAlive: boolean = false,
  enableBrowser: boolean = false,
  executionMode: string = 'orchestrator_external',
  apiKeys?: { ... },
  githubToken?: string | null,
  githubUser?: { ... } | null,
) {
```

- [ ] **Step 5: Add early return for `external_only` mode**

After the log about configs (after line 430, before sandbox creation), add:

```typescript
if (executionMode === 'external_only') {
  await logger.info('External agent mode: skipping orchestrator')
}
```

- [ ] **Step 6: Conditionally run orchestrator**

Replace lines 621-673 (the inline orchestrator) with:

```typescript
// === ORCHESTRATOR SUB-AGENT LOGIC ===
let finalPrompt = sanitizedPrompt
if (executionMode !== 'external_only') {
  try {
    await logger.info('Running orchestrator')
    const result = await runOrchestrator(sanitizedPrompt, {
      taskId,
      selectedModel: selectedModel || 'gpt-4o-mini',
    })
    if (result.finalAnswer) {
      finalPrompt = result.finalAnswer
      await logger.info('Orchestrator refined the prompt')
    }
  } catch (orchError) {
    console.error('Orchestrator evaluation failed:', orchError)
    await logger.info('Orchestrator skipped due to error, proceeding with standard execution')
  }
}
```

- [ ] **Step 7: Handle `orchestrator_only` mode — skip external agent**

Before the `executeAgentInSandbox` call (line 678), add:

```typescript
if (executionMode === 'orchestrator_only') {
  await logger.info('Orchestrator-only mode: skipping external agent execution')
  await logger.success('Orchestrator completed')
  await logger.updateStatus('completed')
  await logger.updateProgress(100, 'Task completed successfully')
  return
}
```

- [ ] **Step 8: Run formatting and type-check**

```bash
pnpm format
pnpm type-check
pnpm lint
```

- [ ] **Step 9: Commit**

```bash
git add app/api/tasks/route.ts
git commit -m "Wire executionMode through POST handler and processTask"
```

---

### Task 6: UI — Task Form

**Files:**
- Modify: `components/task-form.tsx`

**Interfaces:**
- Consumes: TaskFormProps (onSubmit signature)
- Produces: execution mode Select + conditional agent Select

- [ ] **Step 1: Add execution mode constants and state**

After the existing `useState` declarations (near line 100), add:

```typescript
const EXECUTION_MODES = [
  { value: 'orchestrator_external', label: 'Orchestrator + External Agent', description: 'Orchestrator refines prompt, then external agent executes' },
  { value: 'orchestrator_only', label: 'Orchestrator Only', description: 'Orchestrator analyzes and plans without executing code' },
  { value: 'external_only', label: 'External Agent Only', description: 'Skip orchestrator, send prompt directly to agent' },
] as const

const [executionMode, setExecutionMode] = useState('orchestrator_external')
```

- [ ] **Step 2: Add execution mode Select to the form UI**

Insert after the prompt textarea (after line 440) and before Agent Selection:

```typescript
{/* Execution Mode */}
<div className="px-4 pb-2">
  <Select
    value={executionMode}
    onValueChange={(value) => setExecutionMode(value)}
    disabled={isSubmitting}
  >
    <SelectTrigger className="w-full sm:w-[280px] h-8 text-xs border-border/50">
      <SelectValue placeholder="Execution mode" />
    </SelectTrigger>
    <SelectContent>
      {EXECUTION_MODES.map((mode) => (
        <SelectItem key={mode.value} value={mode.value}>
          <div className="flex flex-col">
            <span>{mode.label}</span>
            <span className="text-xs text-muted-foreground">{mode.description}</span>
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 3: Conditionally hide Agent/Model for orchestrator_only**

Wrap the Agent Selection section (from Agent Select through Model Selection) with:

```typescript
{executionMode !== 'orchestrator_only' && (
  // ... existing Agent and Model selection code ...
)}
```

- [ ] **Step 4: Add executionMode to onSubmit data**

In the submit handler (find the `onSubmit` call), make sure executionMode is included:

The submit button's onClick creates the data object. Update it to include executionMode.

- [ ] **Step 5: Run formatting and type-check**

```bash
pnpm format
pnpm type-check
pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add components/task-form.tsx
git commit -m "Add execution mode Select to task form"
```

---

### Task 7: UI — Home Page Content

**Files:**
- Modify: `components/home-page-content.tsx`

**Interfaces:**
- Consumes: `executionMode` from form data
- Produces: `executionMode` passed in API calls + `addTaskOptimistically`

- [ ] **Step 1: Update handleTaskSubmit type**

Add `executionMode` to the data parameter type (line 329):

```typescript
const handleTaskSubmit = async (data: {
  prompt: string
  repoUrl: string
  selectedAgent: string
  selectedModel: string
  selectedModels?: string[]
  installDependencies: boolean
  maxDuration: number
  keepAlive: boolean
  enableBrowser: boolean
  executionMode: string
}) => {
```

- [ ] **Step 2: Add executionMode to API call**

Find the single-repo fetch call (around line 450-470 area, after the multi-agent block) and add `executionMode: data.executionMode` to the body.

Also update the multi-repo task data construction (lines 383-394) to include `executionMode`.

- [ ] **Step 3: Run formatting and type-check**

```bash
pnpm format
pnpm type-check
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add components/home-page-content.tsx
git commit -m "Pass executionMode from task form to API"
```
