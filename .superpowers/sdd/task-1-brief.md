### Task 1: Dictionary Files (en.ts + he.ts + index.ts)

**Files:**
- Create: `dictionaries/en.ts`
- Create: `dictionaries/he.ts`
- Modify: `dictionaries/index.ts`

**Interfaces:**
- Produces: `Locale` type (`'en' | 'he'`), `getDictionary(locale)` function, typed dictionary objects with hierarchical keys

- [ ] **Step 1: Create `dictionaries/en.ts`** with ALL English strings organized by domain

Write this file with exact content from the plan `docs/superpowers/plans/2026-07-26-hebrew-localization.md` Task 1 Step 1.

- [ ] **Step 2: Create `dictionaries/he.ts`** with ALL Hebrew translations

Write this file with exact content from the plan Task 1 Step 2. All Hebrew strings from the plan.

- [ ] **Step 3: Update `dictionaries/index.ts`** to re-export types and `getDictionary`

```typescript
export type { Dictionary } from './en'
export { en } from './en'
export { he } from './he'

export type Locale = 'en' | 'he'

export const getDictionary = (locale: Locale): typeof en => {
  return locale === 'he' ? he : en
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm type-check`
Expected: No type errors

- [ ] **Step 5: Report back with status (DONE/NEEDS_CONTEXT/BLOCKED)**

Return: status, list of commits made, test results, any concerns.
