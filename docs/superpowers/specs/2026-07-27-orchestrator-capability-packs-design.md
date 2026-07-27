# Orchestrator Capability Packs — Design Document

## Overview

Add tiered capability packs to the existing Orchestrator agent, enabling it with features found in OpenCode, Claude Code, Devin, Antigravity, and Replit Agent. The architecture extends the existing orchestrator with pluggable capability packs, mode switching, and a unified tool API — all while keeping backward compatibility.

## Execution Modes (Enhanced)

The existing `executionMode` field (`orchestrator_external`, `orchestrator_only`, `external_only`) is extended with capability levels:

| Mode | Orchestrator Level | External Agent | Use Case |
|---|---|---|---|
| `external_only` | — | Always runs | Quick tasks, direct agent use |
| `basic` (replaces `orchestrator_*` with basic) | Basic (current tools only) | As configured | Simple analysis, backward compat |
| `enhanced` | Enhanced (all capability packs) | As configured | Complex tasks needing research, planning, code generation |
| `auto` | Auto-scales (basic → enhanced as needed) | As configured | Default — adapts to task complexity |
| `enhanced_only` | Enhanced (all capability packs) | Never runs | Full analysis without code changes |

## Architecture

```
lib/ai/orchestrator/
├── loop.ts                 # [modified] Accepts CapabilityLevel, loads packs
├── state.ts                # [modified] Tracks level, pack availability, sandbox ref
├── tools.ts                # [unchanged] Legacy basic tools (spawnSubAgent etc.)
├── modes.ts                # [new] Level config, factory, validation
├── capabilities/           # [new] Capability packs
│   ├── types.ts            # Tool definitions, result types, context
│   ├── index.ts            # Loads packs by level, merges tools
│   ├── file-tools.ts       # readFile, writeFile, editFile, glob, grep
│   ├── shell-tools.ts      # bash (via sandbox), powershell
│   ├── web-tools.ts        # webfetch, websearch
│   ├── plan-tools.ts       # createPlan, approveStep, presentPlan
│   ├── session-tools.ts    # checkpoint, restore, fork
│   ├── background.ts       # scheduleTask, monitorBackground
│   └── research-tools.ts   # Scout-style codebase exploration
└── runtime/
    └── sandbox-bridge.ts   # [new] Proxy for sandbox operations
```

## Capability Packs

### 1. File Tools (`file-tools.ts`)
Read, write, edit, and search files via sandbox proxy.

- `readFile(path, offset?, limit?)` — Read file contents with optional range
- `writeFile(path, content)` — Create or overwrite a file
- `editFile(path, oldString, newString, replaceAll?)` — String replacement editing
- `glob(pattern)` — Find files by glob pattern
- `grep(pattern, path?, include?)` — Regex content search

### 2. Shell Tools (`shell-tools.ts`)
Execute commands in the sandbox.

- `bash(command, args?, timeout?)` — Run shell command via sandbox proxy
- `monitor(command, args?)` — Run long-lived command with streaming output

### 3. Web Tools (`web-tools.ts`)
Research and fetch external information.

- `webfetch(url, format?)` — Fetch URL content (markdown/text/html)
- `websearch(query, numResults?)` — Search the web

### 4. Plan Tools (`plan-tools.ts`)
Structured planning and approval workflow.

- `createPlan(objective, constraints?)` — Generate step-by-step plan
- `presentPlan(plan)` — Display plan for user review
- `approveStep(stepId)` — Mark a step as approved
- `revisePlan(feedback)` — Update plan based on feedback

### 5. Session Tools (`session-tools.ts`)
State persistence and recovery.

- `checkpoint(label?)` — Save current state snapshot
- `restore(checkpointId)` — Restore to previous state
- `fork()` — Create branch from current state
- `getHistory()` — Return execution history

### 6. Background Tools (`background.ts`)
Deferred and parallel execution.

- `scheduleTask(prompt, schedule?)` — Create deferred task
- `monitorBackground(taskId)` — Check background task status
- `parallelMap(items, fn)` — Execute items concurrently

### 7. Research Tools (`research-tools.ts`)
Codebase exploration (Scout-style).

- `exploreRepository(path?)` — Analyze repo structure, dependencies, config
- `findRelevantCode(query)` — Semantic code search
- `readDocumentation(topic)` — Fetch and summarize docs

## Level-to-Pack Mapping

| Level | File | Shell | Web | Plan | Session | Background | Research |
|---|---|---|---|---|---|---|---|
| `basic` | — | — | — | — | — | — | — |
| `enhanced` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auto` | on-demand | on-demand | on-demand | on-demand | always | always | on-demand |

## Integration Points

### 1. Task API (`app/api/tasks/route.ts`)
- Accept `executionLevel` alongside `executionMode`
- Pass level to `runOrchestrator`
- Handle `enhanced_only` mode

### 2. Task Form UI (`components/task-form.tsx`)
- Add capability level selector (Basic / Enhanced / Auto)
- Show/hide advanced options based on level

### 3. Database (`lib/db/schema.ts`)
- Extend `executionMode` enum with new values
- Add migration for existing tasks

### 4. Sandbox Bridge (`lib/ai/orchestrator/runtime/sandbox-bridge.ts`)
- Provides sandbox operations to orchestrator tools
- Uses `runCommandInSandbox`, `runInProject`, `Sandbox.writeFiles`, etc.

## Implementation Order

1. **Phase 1** — Foundation (this implementation)
   - Create `capabilities/types.ts` with tool type definitions
   - Create `capabilities/index.ts` with mode-to-pack mapping
   - Create `modes.ts` with level config
   - Create `web-tools.ts` (webfetch, websearch) — server-side, no sandbox needed
   - Create `plan-tools.ts` (createPlan, presentPlan) — pure AI, no sandbox needed
   - Create `session-tools.ts` (checkpoint, restore) — state management
   - Create `background.ts` (scheduleTask, monitorBackground)
   - Create `research-tools.ts` (exploreRepository, findRelevantCode)
   - Update `state.ts` for capability tracking
   - Update `loop.ts` to accept and use capability level
   - Update `modes.ts` with full level configurations

2. **Phase 2** — Sandbox-dependent tools (next iteration)
   - Create `runtime/sandbox-bridge.ts`
   - Create `file-tools.ts` (needs sandbox proxy)
   - Create `shell-tools.ts` (needs sandbox proxy)

3. **Phase 3** — UI and integration (next iteration)
   - Update task form UI
   - Update API routes
   - Add database migration

## Files NOT Modified
- `lib/ai/orchestrator/tools.ts` — Legacy tools preserved for backward compat
- `lib/sandbox/agents/*.ts` — External agents unchanged
- `lib/memory/*.ts` — Memory system unchanged but enhanced orchestrator can use it

## Future Work (Post-Phase 1)
- LSP Integration — Language server protocol for code intelligence
- Browser Testing — Chrome DevTools Protocol for web testing
- Plugin System — Hot-loadable capability packs from npm/config
