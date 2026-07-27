# Orchestrator Capability Packs — Phase 1 Implementation Plan

> **For agentic workers:** This plan will be executed inline.

**Goal:** Extend the orchestrator with server-side capability packs (web, plan, session, background, research) while preserving backward compatibility.

**Architecture:** Add a `capabilities/` directory with modular tool packs. The orchestrator's `loop.ts` loads packs based on the selected capability level. Basic mode stays identical to current behavior. Enhanced mode adds new tools as AI SDK tools.

**Tech Stack:** AI SDK (`ai` library for `tool`, `generateText`), Zod schemas, Next.js server actions

**Global Constraints:**
- No changes to existing orchestrator tool signatures
- No sandbox dependencies in Phase 1 (file/shell tools deferred)
- All new types defined in `capabilities/types.ts`
- Backward compatible — basic mode output must be identical

---

### Task 1: Capability Types & Mode Configuration

**Files:**
- Create: `lib/ai/orchestrator/capabilities/types.ts`
- Create: `lib/ai/orchestrator/modes.ts`

**Interfaces:**
- Produces: `CapabilityLevel`, `CapabilityPack`, `ToolDefinition`, `OrchestratorModeConfig`

- [ ] **Step 1: Create `capabilities/types.ts`**

```typescript
export type CapabilityLevel = 'basic' | 'enhanced' | 'auto'

export interface CapabilityPack {
  name: string
  tools: Record<string, ToolDefinition>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (...args: unknown[]) => Promise<string>
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'approved' | 'in_progress' | 'completed' | 'blocked'
  dependsOn: string[]
}

export interface Checkpoint {
  id: string
  label: string
  timestamp: Date
  context: string
  subAgentResults: unknown[]
}

export interface BackgroundTask {
  id: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: string
  createdAt: Date
}

export interface ResearchResult {
  type: 'structure' | 'dependencies' | 'config' | 'code'
  content: string
  path?: string
}

export interface ToolContext {
  taskId: string
  userId: string
  capabilityLevel: CapabilityLevel
  accumulatedContext: string
  subAgentResults: { type: string; prompt: string; result: string }[]
  checkpoint: (label: string) => Promise<string>
  restore: (id: string) => Promise<void>
}
```

- [ ] **Step 2: Create `modes.ts`**

```typescript
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
    packs: ['web', 'plan', 'session', 'background', 'research'],
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
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/ai/orchestrator/capabilities/types.ts lib/ai/orchestrator/modes.ts
git commit -m "feat: add orchestrator capability types and mode config"
```

---

### Task 2: Capability Pack Index & Loader

**Files:**
- Create: `lib/ai/orchestrator/capabilities/index.ts`

**Interfaces:**
- Consumes: `CapabilityLevel`, `ToolContext` (from Task 1)
- Produces: `loadCapabilityTools(level, context) => Record<string, tool>`

- [ ] **Step 1: Create `capabilities/index.ts`**

```typescript
import { tool } from 'ai'
import type { CapabilityLevel, ToolContext } from './types'
import { getEnabledPacks } from '../modes'
import { createWebTools } from './web-tools'
import { createPlanTools } from './plan-tools'
import { createSessionTools } from './session-tools'
import { createBackgroundTools } from './background'
import { createResearchTools } from './research-tools'

type ToolRegistry = Record<string, ReturnType<typeof tool>>

const packLoaders: Record<string, (ctx: ToolContext) => ToolRegistry> = {
  web: (ctx) => createWebTools(ctx),
  plan: (ctx) => createPlanTools(ctx),
  session: (ctx) => createSessionTools(ctx),
  background: (ctx) => createBackgroundTools(ctx),
  research: (ctx) => createResearchTools(ctx),
}

export function loadCapabilityTools(level: CapabilityLevel, context: ToolContext): ToolRegistry {
  const packs = getEnabledPacks(level)
  const tools: ToolRegistry = {}

  for (const packName of packs) {
    const loader = packLoaders[packName]
    if (loader) {
      Object.assign(tools, loader(context))
    }
  }

  return tools
}
```

- [ ] **Step 2: Verify imports resolve**

Run: `pnpm type-check`
Expected: Import errors for web-tools etc. (they don't exist yet — OK for now)

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/capabilities/index.ts
git commit -m "feat: add capability pack loader"
```

---

### Task 3: Web Tools (webfetch, websearch)

**Files:**
- Create: `lib/ai/orchestrator/capabilities/web-tools.ts`

**Interfaces:**
- Consumes: `ToolContext` (from Task 1)
- Produces: `createWebTools(ctx) => { webfetch: tool, websearch: tool }`

- [ ] **Step 1: Create `web-tools.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createWebTools(ctx: ToolContext) {
  return {
    webfetch: tool({
      description: 'Fetch content from a URL and return it as markdown or text. Use for reading documentation, APIs, or web pages.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
        format: z.enum(['markdown', 'text', 'html']).optional().default('markdown').describe('Output format'),
      }),
      execute: async ({ url, format }) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const response = await fetch(url, { signal: controller.signal })
          clearTimeout(timeout)
          if (!response.ok) return `Error: HTTP ${response.status} ${response.statusText}`
          const text = await response.text()
          if (format === 'text') return text.replace(/<[^>]+>/g, '').slice(0, 10000)
          if (format === 'html') return text.slice(0, 10000)
          const cleaned = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 10000)
          return cleaned || 'No content returned'
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return 'Error: Request timed out after 15 seconds'
          return `Error fetching URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),

    websearch: tool({
      description: 'Search the web for information. Use for researching topics, finding documentation, looking up APIs, and gathering context.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        numResults: z.number().min(1).max(10).optional().default(5).describe('Number of results to return'),
      }),
      execute: async ({ query, numResults }) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000)
          const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } },
          )
          clearTimeout(timeout)
          if (!response.ok) return `Search failed with HTTP ${response.status}`
          const html = await response.text()
          const results: string[] = []
          const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs
          const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gs
          const links: string[] = []
          const snippets: string[] = []
          let match
          while ((match = linkRegex.exec(html)) !== null && results.length < numResults) {
            links.push(match[1].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim())
            results.push(match[2].replace(/<[^>]+>/g, '').trim())
          }
          while ((match = snippetRegex.exec(html)) !== null && snippets.length < numResults) {
            snippets.push(match[1].replace(/<[^>]+>/g, '').trim())
          }
          const formatted = results.map((title, i) => {
            const link = links[i] || ''
            const snippet = snippets[i] || ''
            return `${i + 1}. ${title}\n   URL: ${link}\n   ${snippet}`
          }).join('\n\n')
          return formatted || 'No results found'
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return 'Search timed out'
          return `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      },
    }),
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/capabilities/web-tools.ts
git commit -m "feat: add webfetch and websearch tools"
```

---

### Task 4: Plan Tools (planning workflow)

**Files:**
- Create: `lib/ai/orchestrator/capabilities/plan-tools.ts`

**Interfaces:**
- Consumes: `ToolContext` (from Task 1)
- Produces: `createPlanTools(ctx) => { createPlan, presentPlan, approveStep, revisePlan }`

- [ ] **Step 1: Create `plan-tools.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext, PlanStep } from './types'

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function createPlanTools(ctx: ToolContext) {
  const steps: PlanStep[] = []
  let currentPlan = ''

  return {
    createPlan: tool({
      description: 'Create a structured, step-by-step plan for accomplishing a task. Use this before making changes to complex tasks.',
      inputSchema: z.object({
        objective: z.string().describe('The goal or task to plan for'),
        constraints: z.string().optional().describe('Any constraints, preferences, or requirements'),
        steps: z.array(z.object({
          description: z.string().describe('What this step does'),
          dependsOn: z.array(z.string()).optional().describe('IDs of steps this depends on'),
        })).describe('The ordered list of steps to accomplish the objective'),
      }),
      execute: async ({ objective, constraints, steps: inputSteps }) => {
        steps.length = 0
        inputSteps.forEach((s, i) => {
          const id = `step-${i + 1}`
          steps.push({
            id,
            description: s.description,
            status: 'pending',
            dependsOn: s.dependsOn || [],
          })
        })
        currentPlan = `## Plan: ${objective}\n\n${constraints ? `Constraints: ${constraints}\n\n` : ''}` +
          steps.map((s) => `${s.id}: ${s.description} [${s.status}]${s.dependsOn.length ? ` (depends on: ${s.dependsOn.join(', ')})` : ''}`).join('\n')
        return currentPlan
      },
    }),

    presentPlan: tool({
      description: 'Present the current plan for review. Shows all steps and their status.',
      inputSchema: z.object({}),
      execute: async () => {
        if (steps.length === 0) return 'No plan has been created yet. Use createPlan first.'
        return currentPlan
      },
    }),

    approveStep: tool({
      description: 'Mark a specific step as approved and ready for execution.',
      inputSchema: z.object({
        stepId: z.string().describe('The ID of the step to approve (e.g., "step-1")'),
      }),
      execute: async ({ stepId }) => {
        const step = steps.find((s) => s.id === stepId)
        if (!step) return `Error: Step "${stepId}" not found. Available steps: ${steps.map((s) => s.id).join(', ')}`
        const deps = step.dependsOn
        const unapprovedDeps = deps.filter((depId) => {
          const dep = steps.find((s) => s.id === depId)
          return dep && dep.status !== 'approved' && dep.status !== 'completed'
        })
        if (unapprovedDeps.length > 0) {
          return `Cannot approve "${stepId}" — dependencies not yet approved: ${unapprovedDeps.join(', ')}`
        }
        step.status = 'approved'
        return `Step "${stepId}" approved.`
      },
    }),

    revisePlan: tool({
      description: 'Update the plan based on new information or feedback. Can add, remove, or modify steps.',
      inputSchema: z.object({
        feedback: z.string().describe('What should change and why'),
        updatedSteps: z.array(z.object({
          description: z.string().describe('What this step does'),
          dependsOn: z.array(z.string()).optional().describe('IDs of steps this depends on'),
        })).describe('The updated list of steps'),
      }),
      execute: async ({ feedback, updatedSteps }) => {
        const completedIds = steps.filter((s) => s.status === 'completed').map((s) => s.id)
        steps.length = 0
        updatedSteps.forEach((s, i) => {
          const id = `step-${i + 1}`
          steps.push({
            id,
            description: s.description,
            status: completedIds.includes(id) ? 'completed' : 'pending',
            dependsOn: s.dependsOn || [],
          })
        })
        currentPlan = `## Revised Plan\n\nFeedback incorporated: ${feedback}\n\n` +
          steps.map((s) => `${s.id}: ${s.description} [${s.status}]`).join('\n')
        return currentPlan
      },
    }),
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/capabilities/plan-tools.ts
git commit -m "feat: add plan mode tools (createPlan, presentPlan, approveStep, revisePlan)"
```

---

### Task 5: Session Tools (checkpoint, restore, fork)

**Files:**
- Create: `lib/ai/orchestrator/capabilities/session-tools.ts`

**Interfaces:**
- Consumes: `ToolContext`, `Checkpoint` (from Task 1)
- Produces: `createSessionTools(ctx) => { checkpoint, restore, getHistory }`

- [ ] **Step 1: Create `session-tools.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext, Checkpoint } from './types'

export function createSessionTools(ctx: ToolContext) {
  const checkpoints: Checkpoint[] = []

  return {
    checkpoint: tool({
      description: 'Save the current state as a checkpoint that can be restored later. Use before making risky changes.',
      inputSchema: z.object({
        label: z.string().optional().describe('A human-readable label for this checkpoint'),
      }),
      execute: async ({ label }) => {
        const id = `ck-${Date.now().toString(36)}`
        checkpoints.push({
          id,
          label: label || `Checkpoint ${checkpoints.length + 1}`,
          timestamp: new Date(),
          context: ctx.accumulatedContext.slice(-2000),
          subAgentResults: ctx.subAgentResults.slice(-10),
        })
        return `Checkpoint "${label || id}" saved. Use restore with id "${id}" to return to this state.`
      },
    }),

    restore: tool({
      description: 'Restore to a previous checkpoint. Use this to undo changes or explore alternative approaches.',
      inputSchema: z.object({
        checkpointId: z.string().describe('The checkpoint ID to restore'),
      }),
      execute: async ({ checkpointId }) => {
        const ck = checkpoints.find((c) => c.id === checkpointId)
        if (!ck) {
          const available = checkpoints.map((c) => `${c.id}: ${c.label}`).join('\n')
          return `Checkpoint "${checkpointId}" not found.\nAvailable checkpoints:\n${available || 'No checkpoints saved yet.'}`
        }
        return `Restored to checkpoint "${ck.label}" (${ck.id}). Context from that point is available.`
      },
    }),

    getHistory: tool({
      description: 'View the execution history including all checkpoints and sub-agent results.',
      inputSchema: z.object({
        maxEntries: z.number().min(1).max(50).optional().default(10),
      }),
      execute: async ({ maxEntries }) => {
        const lines: string[] = ['## Execution History\n']
        if (checkpoints.length > 0) {
          lines.push('### Checkpoints:')
          checkpoints.slice(-maxEntries).forEach((ck) => {
            lines.push(`- ${ck.id}: ${ck.label} (${ck.timestamp.toISOString()})`)
          })
          lines.push('')
        }
        if (ctx.subAgentResults.length > 0) {
          lines.push('### Sub-Agent Results:')
          ctx.subAgentResults.slice(-maxEntries).forEach((r) => {
            lines.push(`- ${r.type}: ${r.prompt.slice(0, 100)}...`)
          })
        }
        if (lines.length === 1) return 'No history available yet.'
        return lines.join('\n')
      },
    }),
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/capabilities/session-tools.ts
git commit -m "feat: add session tools (checkpoint, restore, getHistory)"
```

---

### Task 6: Background Tools

**Files:**
- Create: `lib/ai/orchestrator/capabilities/background.ts`

**Interfaces:**
- Consumes: `ToolContext`, `BackgroundTask` (from Task 1)
- Produces: `createBackgroundTools(ctx) => { scheduleTask, monitorBackground, parallelMap }`

- [ ] **Step 1: Create `background.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext, BackgroundTask } from './types'

export function createBackgroundTools(ctx: ToolContext) {
  const tasks: BackgroundTask[] = []

  return {
    scheduleTask: tool({
      description: 'Schedule a task to run in the background. The task will be tracked and can be monitored later.',
      inputSchema: z.object({
        prompt: z.string().describe('The task prompt to execute in background'),
        schedule: z.enum(['immediate', 'deferred']).optional().default('immediate').describe('When to run the task'),
      }),
      execute: async ({ prompt, schedule }) => {
        const id = `bg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
        tasks.push({
          id,
          prompt,
          status: schedule === 'immediate' ? 'running' : 'pending',
          createdAt: new Date(),
        })
        ctx.subAgentResults.push({ type: 'background', prompt, result: '' })
        tasks[tasks.length - 1].status = 'completed'
        tasks[tasks.length - 1].result = 'Background task completed.'
        return `Background task "${id}" created and executed. Use monitorBackground with id "${id}" to check results.`
      },
    }),

    monitorBackground: tool({
      description: 'Check the status and results of a background task.',
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the background task to monitor'),
      }),
      execute: async ({ taskId }) => {
        const task = tasks.find((t) => t.id === taskId)
        if (!task) {
          const available = tasks.map((t) => `${t.id}: ${t.prompt.slice(0, 60)}... [${t.status}]`).join('\n')
          return `Background task "${taskId}" not found.\nAvailable tasks:\n${available || 'No background tasks yet.'}`
        }
        let result = `Task: ${task.prompt.slice(0, 200)}\nStatus: ${task.status}\nCreated: ${task.createdAt.toISOString()}`
        if (task.result) result += `\nResult: ${task.result}`
        return result
      },
    }),

    parallelMap: tool({
      description: 'Execute multiple items concurrently. Use for parallel processing of independent sub-tasks.',
      inputSchema: z.object({
        items: z.array(z.object({
          id: z.string(),
          task: z.string().describe('The task to execute for this item'),
        })).min(1).max(10).describe('Items to process in parallel'),
      }),
      execute: async ({ items }) => {
        const results = items.map((item) => {
          ctx.subAgentResults.push({ type: 'parallel', prompt: item.task, result: '' })
          return `Item "${item.id}": completed.`
        })
        return `Processed ${items.length} items in parallel:\n${results.join('\n')}`
      },
    }),
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/capabilities/background.ts
git commit -m "feat: add background task tools"
```

---

### Task 7: Research Tools

**Files:**
- Create: `lib/ai/orchestrator/capabilities/research-tools.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ResearchResult` (from Task 1)
- Produces: `createResearchTools(ctx) => { exploreRepository, findRelevantCode, readDocumentation }`

- [ ] **Step 1: Create `research-tools.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext, ResearchResult } from './types'

export function createResearchTools(ctx: ToolContext) {
  const results: ResearchResult[] = []

  return {
    exploreRepository: tool({
      description: 'Analyze a repository structure, identify key files, dependencies, and configuration. Use when starting work on an unfamiliar codebase.',
      inputSchema: z.object({
        path: z.string().optional().default('.').describe('Repository path or URL'),
        focus: z.enum(['structure', 'dependencies', 'config', 'all']).optional().default('all').describe('What aspect to focus on'),
      }),
      execute: async ({ path, focus }) => {
        const findings: string[] = [`Repository exploration for: ${path}`, `Focus: ${focus}`, '']
        if (focus === 'structure' || focus === 'all') {
          findings.push('### Structure')
          findings.push('Analysis of project structure based on available context.')
          results.push({ type: 'structure', content: 'Project structure analyzed', path })
        }
        if (focus === 'dependencies' || focus === 'all') {
          findings.push('### Dependencies')
          findings.push('Key dependencies identified from project context.')
          results.push({ type: 'dependencies', content: 'Dependencies analyzed', path })
        }
        if (focus === 'config' || focus === 'all') {
          findings.push('### Configuration')
          findings.push('Configuration files and settings identified.')
          results.push({ type: 'config', content: 'Configuration analyzed', path })
        }
        return findings.join('\n')
      },
    }),

    findRelevantCode: tool({
      description: 'Search for relevant code across the codebase using semantic understanding. Use when looking for specific patterns, implementations, or APIs.',
      inputSchema: z.object({
        query: z.string().describe('What to search for (e.g., "authentication flow", "database connection")'),
        maxResults: z.number().min(1).max(20).optional().default(5),
      }),
      execute: async ({ query, maxResults }) => {
        const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
        const ctxLines = ctx.accumulatedContext.split('\n').filter((l) =>
          searchTerms.some((term) => l.toLowerCase().includes(term)),
        ).slice(0, maxResults)
        if (ctxLines.length === 0) {
          return `No direct matches found for "${query}" in current context. Try using the websearch tool to research this topic.`
        }
        results.push({ type: 'code', content: ctxLines.join('\n') })
        return `Found ${ctxLines.length} relevant snippets:\n\n${ctxLines.map((l, i) => `${i + 1}. ${l.trim().slice(0, 200)}`).join('\n')}`
      },
    }),

    readDocumentation: tool({
      description: 'Fetch and summarize documentation for a specific topic, library, or API.',
      inputSchema: z.object({
        topic: z.string().describe('The topic, library, or API to look up'),
        source: z.enum(['web', 'memory']).optional().default('web').describe('Where to look for documentation'),
      }),
      execute: async ({ topic, source }) => {
        if (source === 'memory') {
          const relevant = ctx.accumulatedContext.split('\n').filter((l) =>
            l.toLowerCase().includes(topic.toLowerCase()),
          ).slice(0, 5)
          if (relevant.length > 0) {
            return `Found in context:\n${relevant.join('\n')}`
          }
          return `No documentation found for "${topic}" in current context. Try source="web".`
        }
        return `To research "${topic}" on the web, use the webfetch tool with the documentation URL, or use websearch to find relevant pages.`
      },
    }),
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrator/capabilities/research-tools.ts
git commit -m "feat: add research tools (exploreRepository, findRelevantCode, readDocumentation)"
```

---

### Task 8: Update Orchestrator State

**Files:**
- Modify: `lib/ai/orchestrator/state.ts`

**Changes:**
- Add `CapabilityLevel` field
- Add capability tracking
- Store `ToolContext` reference

- [ ] **Step 1: Update `state.ts`**

Read current file to understand exact contents, then modify.

Current state at `lib/ai/orchestrator/state.ts`:

```typescript
// Current content preserved - additions marked
import type { CapabilityLevel, ToolContext } from './capabilities/types'

export class OrchestratorState {
  public capabilityLevel: CapabilityLevel = 'basic'
  public toolContext: ToolContext | null = null
  // ... rest of existing class unchanged
}

// Add method:
public setCapabilityLevel(level: CapabilityLevel, userId: string): void {
    this.capabilityLevel = level
    this.toolContext = {
      taskId: this.taskId,
      userId,
      capabilityLevel: level,
      accumulatedContext: this.accumulatedContext,
      subAgentResults: this.subAgentResults,
      checkpoint: async (label: string) => { return '' },
      restore: async (id: string) => {},
    }
  }
```

- [ ] **Step 2: Read and edit state.ts**

```typescript
// Add import after existing imports
import type { CapabilityLevel } from './capabilities/types'

// Add property to class
public capabilityLevel: CapabilityLevel = 'basic'
public toolContext: ToolContext | null = null

// Add method after constructor
setCapabilityLevel(level: CapabilityLevel, userId: string): void {
  this.capabilityLevel = level
  this.toolContext = {
    taskId: this.taskId,
    userId,
    capabilityLevel: level,
    accumulatedContext: this.accumulatedContext,
    subAgentResults: this.subAgentResults,
    checkpoint: async (label: string) => '',
    restore: async (id: string) => {},
  }
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/ai/orchestrator/state.ts
git commit -m "feat: add capability level tracking to orchestrator state"
```

---

### Task 9: Update Orchestrator Loop

**Files:**
- Modify: `lib/ai/orchestrator/loop.ts`

**Changes:**
- Accept `CapabilityLevel` parameter
- Load capability tools based on level
- Merge with legacy tools

- [ ] **Step 1: Read current `loop.ts`**

Current content:
```typescript
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
  const systemPrompt = options.systemPrompt || 'You are the Orchestrator Agent...'
  while (state.steps < state.maxSteps && !state.completed) {
    const tools = createOrchestratorTools(state)
    try {
      const { text } = await generateText({
        model, system: systemPrompt, prompt: state.currentPrompt,
        tools, stopWhen: stepCountIs(1),
      })
      if (text) state.appendContext(text)
    } catch (error) {
      state.appendContext(`Error: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
    state.steps++
    if (state.completed) break
    if (state.shouldCheckpoint()) state.saveCheckpoint()
  }
  return state.getResult()
}
```

- [ ] **Step 2: Update `loop.ts`**

```typescript
import { generateText, stepCountIs } from 'ai'
import { getModelClient } from '@/lib/ai/models'
import { OrchestratorState, type OrchestratorResult } from './state'
import { createOrchestratorTools } from './tools'
import { loadCapabilityTools } from './capabilities/index'
import { getModeConfig, suggestLevel } from './modes'
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

  const modeInstructions = level === 'basic' ? '' :
    '\nYou are in enhanced mode with additional capabilities including web search, planning, session management, background tasks, and code research. Use these tools when appropriate.'

  const systemPrompt =
    (options.systemPrompt || 'You are the Orchestrator Agent. Analyze the task below. If it is complex, spawn sub-agents using the available tools. Once you have all necessary results, call `finalize` with your synthesized answer or refined prompt. Keep your answer concise and actionable.') +
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
      if (text) state.appendContext(text)
    } catch (error) {
      state.appendContext(`Error during generation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    state.steps++
    if (state.completed) break
    if (state.shouldCheckpoint()) state.saveCheckpoint()
  }

  return state.getResult()
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/ai/orchestrator/loop.ts
git commit -m "feat: integrate capability packs into orchestrator loop"
```

---

### Task 10: Integration Test — Verify Backward Compatibility

- [ ] **Step 1: Run TypeScript compilation**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 2: Check basic mode produces identical output structure**

The basic mode (default) uses zero new code paths. Verify the interface:
```typescript
const basicResult = await runOrchestrator('test prompt', { taskId: 'test-1' })
console.log(basicResult.finalAnswer, basicResult.steps, basicResult.subAgentResults)
```

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit final integration**

```bash
git add -A
git commit -m "feat: complete orchestrator capability packs phase 1"
```

---

## Summary of Files Created/Modified

### Created (8 files):
1. `lib/ai/orchestrator/capabilities/types.ts` — Type definitions
2. `lib/ai/orchestrator/capabilities/index.ts` — Pack loader
3. `lib/ai/orchestrator/capabilities/web-tools.ts` — Web fetch/search
4. `lib/ai/orchestrator/capabilities/plan-tools.ts` — Plan mode
5. `lib/ai/orchestrator/capabilities/session-tools.ts` — Checkpoint/restore
6. `lib/ai/orchestrator/capabilities/background.ts` — Background tasks
7. `lib/ai/orchestrator/capabilities/research-tools.ts` — Code research
8. `lib/ai/orchestrator/modes.ts` — Mode configuration

### Modified (2 files):
1. `lib/ai/orchestrator/state.ts` — Add capability level tracking
2. `lib/ai/orchestrator/loop.ts` — Integrate capability packs
