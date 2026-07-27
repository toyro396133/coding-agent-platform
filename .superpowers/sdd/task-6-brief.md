### Task 6: UI — Task Form Execution Mode Select

**Files:**
- Modify: `components/task-form.tsx`

**Interfaces:**
- Consumes: `TaskFormProps` (onSubmit interface)
- Produces: execution mode Select + conditional Agent/Model visibility

- [ ] **Step 1: Add execution mode constants and state**

After the existing `useState` declarations (around line 100), add:

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

```tsx
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

Wrap the Agent Selection section (from line 442 "Agent Selection" through Model Selection) with:

```tsx
{executionMode !== 'orchestrator_only' && (
  // ... existing Agent and Model selection code ...
)}
```

- [ ] **Step 4: Add executionMode to onSubmit data**

In the submit handler (find where `onSubmit` is called with data object), add `executionMode` to the data:

```typescript
onSubmit({
  // ... existing fields
  executionMode,
})
```

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