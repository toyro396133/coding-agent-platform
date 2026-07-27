### Task 5: API Route — Wire executionMode through POST handler

**Files:**
- Modify: `app/api/tasks/route.ts`

**Interfaces:**
- Consumes: `executionMode` from request body; `runOrchestrator` from task 4
- Produces: conditional orchestrator + sandbox agent flow

- [ ] **Step 1: Add executionMode to processTask signature**

Add `executionMode: string = 'orchestrator_external'` after `enableBrowser` in `processTask` function (around line 391).

- [ ] **Step 2: Pass executionMode through processTaskWithTimeout**

Add `executionMode` parameter to `processTaskWithTimeout` (around line 262) and pass it to `processTask` call (around line 308).

- [ ] **Step 3: Update POST handler to extract and pass executionMode**

In the `after()` block (around line 232), read `validatedData.executionMode` and pass it to `processTaskWithTimeout`.

- [ ] **Step 4: Conditionally run orchestrator in processTask**

Replace the inline orchestrator logic (lines 624-676) with conditional call to `runOrchestrator` from task 4:

```typescript
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

- [ ] **Step 5: Handle orchestrator_only mode — skip external agent**

Before the `executeAgentInSandbox` call (around line 681), add:

```typescript
if (executionMode === 'orchestrator_only') {
  await logger.info('Orchestrator-only mode: skipping external agent execution')
  await logger.success('Orchestrator completed')
  await logger.updateStatus('completed')
  await logger.updateProgress(100, 'Task completed successfully')
  return
}
```

- [ ] **Step 6: Run formatting and type-check**

```bash
pnpm format
pnpm type-check
pnpm lint
```

- [ ] **Step 7: Commit**

```bash
git add app/api/tasks/route.ts
git commit -m "Wire executionMode through API route and orchestrator"
```