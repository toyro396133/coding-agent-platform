# Orchestrator Modes Design

## Overview

Allow users to choose between the built-in orchestrator and external agents when creating tasks. Three execution modes that control how the orchestrator and external agents interact.

## Execution Modes

| Mode | Flow | Use Case |
|------|------|----------|
| **Orchestrator + External** | Prompt → Orchestrator Loop → refined prompt → Sandbox Agent | Full power: orchestrator decomposes + agent executes |
| **Orchestrator Only** | Prompt → Orchestrator Loop → final result (code/plan/analysis) | Analysis, planning, or orchestrator manages everything alone |
| **External Agent Only** | Prompt → [skip orchestrator] → Sandbox Agent | Simple tasks, direct execution, when orchestrator is overhead |

## Architecture

### New Files

```
lib/ai/orchestrator/
├── loop.ts          # Main orchestrator loop (replaces inline logic in route.ts)
├── tools.ts         # Extended tool set for the orchestrator
└── state.ts         # State management, checkpoints, persistence
```

### Orchestrator Loop (`loop.ts`)

Replaces the current simple `generateText` with one `spawnSubAgent` tool. The new loop:

```
while (steps < maxSteps && !completed) {
  1. LLM call with current state + available tools
  2. Execute tool calls (parallel when possible)
  3. Collect results into state
  4. If final answer → return
  5. steps++
}
```

### Tools (`tools.ts`)

| Tool | Description |
|------|-------------|
| `spawnSubAgent` | Launch an AI sub-agent for a specific sub-task (existing, now parallel-capable) |
| `spawnSubAgents` | Launch multiple sub-agents in parallel (`Promise.allSettled`) |
| `readFile` | Read a file from the sandbox or workspace |
| `writeFile` | Write a file to the sandbox or workspace |
| `runCommand` | Execute a shell command in the sandbox |
| `queryMCP` | Query an MCP server for data |
| `searchCode` | Search the codebase for patterns |

### State Management (`state.ts`)

```
interface OrchestratorState {
  taskId: string
  steps: number
  maxSteps: number
  subAgentResults: Map<string, string>
  accumulatedContext: string
  checkpointId?: string
  status: 'running' | 'completed' | 'error'
}
```

Checkpoints: save state to DB after every N steps for long-running task persistence and resume capability.

## Database Changes

Add `execution_mode` column to tasks table:

```
execution_mode text('execution_mode').default('orchestrator_external').notNull()
```

Values: `orchestrator_external` | `orchestrator_only` | `external_only`

### Migration

```
ALTER TABLE tasks ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'orchestrator_external';
```

## API Changes

### Task Creation (`app/api/tasks/route.ts`)

- Read `executionMode` from request body
- Conditional flow based on mode:
  - `external_only` → skip orchestrator entirely, go to sandbox
  - `orchestrator_only` → run orchestrator loop, collect result, no sandbox agent
  - `orchestrator_external` → run orchestrator, then sandbox agent (current behavior, but using new loop)

### Schema Validation

Update task creation validation to accept `executionMode` field.

## UI Changes

### Task Creator (`app/tasks/new/page.tsx`)

New fields added to existing task creation form:

```
Execution Mode:
  ↓ Orchestrator + External Agent
    Orchestrator + External Agent
    Orchestrator Only
    External Agent Only

[When Orchestrator + External or External Only]
Agent:
  ↓ Codex CLI
    Codex CLI
    Gemini CLI
    ...
```

The Agent dropdown is conditionally shown only when the execution mode involves an external agent.

## Out of Scope (for this phase)

- Real-time streaming of orchestrator sub-agent results to the UI
- Visual DAG of sub-agent execution
- Resume paused orchestrator tasks from UI
- Orchestrator templates / presets
- Sub-agent result caching

## Data Flow

```
POST /api/tasks { prompt, executionMode, selectedAgent, ... }
  │
  ├── [external_only] → executeAgentInSandbox(prompt, agent) → commit → push
  │
  ├── [orchestrator_only] → orchestratorLoop(prompt, tools)
  │     ├── spawnSubAgents (parallel)
  │     ├── runCommands / readFiles
  │     └── return final result (stored in task)
  │
  └── [orchestrator_external] → orchestratorLoop(prompt, tools)
        └── refinedPrompt → executeAgentInSandbox(refinedPrompt, agent) → commit → push
```
