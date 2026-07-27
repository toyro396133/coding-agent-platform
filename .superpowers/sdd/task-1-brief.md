### Task 1: DB Schema - Add `execution_mode` column

**Files:**
- Modify: `lib/db/schema.ts`

**Goal:** Add a new column `executionMode` to the `tasks` table and update the corresponding Zod schemas (`insertTaskSchema`, `selectTaskSchema`).

- [ ] **Step 1: Modify `lib/db/schema.ts` to add `executionMode` column to `tasks` table.**
  - Add `executionMode` as a `text` column with an enum of `['orchestrator_external', 'orchestrator_only', 'external_only']`.
  - Set default value to `'orchestrator_external'`.
  - Mark it as `notNull()`.

```typescript
  executionMode: text('execution_mode', {
    enum: ['orchestrator_external', 'orchestrator_only', 'external_only'],
  })
    .notNull()
    .default('orchestrator_external'),
```

- [ ] **Step 2: Update `insertTaskSchema` to include `executionMode`.**
  - Add `executionMode` with a Zod enum and default value.

```typescript
  executionMode: z.enum(['orchestrator_external', 'orchestrator_only', 'external_only']).default('orchestrator_external'),
```

- [ ] **Step 3: Update `selectTaskSchema` to include `executionMode`.**
  - Add `executionMode` with a Zod enum (not optional).

```typescript
  executionMode: z.enum(['orchestrator_external', 'orchestrator_only', 'external_only']),
```