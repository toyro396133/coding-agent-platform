### Task 10: Translate Task Details + Task Chat

**Files:**
- Modify: `components/task-details.tsx`
- Modify: `components/task-chat.tsx`

**In `task-details.tsx`:**
1. Add `import { useLocale } from '@/components/providers/locale-provider'`
2. Add `const { t } = useLocale()`
3. Find and replace ALL user-facing strings:
- `'Task Not Found'` → `t.taskDetails.notFound`
- `'The requested task could not be found.'` → `t.taskDetails.notFoundDesc`
- `'Files'` → `t.taskDetails.files`
- `'Code'` → `t.taskDetails.code`
- `'Preview'` → `t.taskDetails.preview`
- `'Chat'` → `t.taskDetails.chat`
- `'Logs'` → `t.taskDetails.logs`
- `'Create PR'` → `t.taskDetails.createPR`
- `'Merge PR'` → `t.taskDetails.mergePR`
- `'Revert Commit'` → `t.taskDetails.revertCommit`
- `'Stop'` → `t.taskDetails.stop`
- `'Restart'` → `t.taskDetails.restart`
- `'Delete'` → `t.taskDetails.delete`
- `'Maximize'` → `t.taskDetails.maximize`
- `'Minimize'` → `t.taskDetails.minimize`
- `'Deploy'` → `t.taskDetails.deploy`
- `'Open Sandbox'` → `t.taskDetails.openSandbox`
- `'Open Preview'` → `t.taskDetails.openPreview`
- `'Invalid URL'` → `t.taskDetails.invalidUrl`
- `'Sandbox Status'` → `t.taskDetails.sandboxStatus`
- `'PR Status'` → `t.taskDetails.prStatus`
- `'Task Progress'` → `t.taskDetails.taskProgress`
- `'Agent'` → `t.taskDetails.agent`
- `'Model'` → `t.taskDetails.model`
- `'Repository'` → `t.taskDetails.repository`
- `'Duration'` → `t.taskDetails.duration`
- `'Branch'` → `t.taskDetails.branch`
- `'No logs available.'` → `t.taskDetails.noLogs`
4. Replace `mr-2` with `me-2` for RTL

**In `task-chat.tsx`:**
This component already uses `getDictionary(locale)` with a `locale` prop. Update to use `useLocale()`:
1. Remove import of `getDictionary` and `Locale` from `@/dictionaries`
2. Add `import { useLocale } from '@/components/providers/locale-provider'`
3. Replace `const t = getDictionary(locale)` with `const { t } = useLocale()`
4. Remove the `locale` prop from the component interface (or keep it for backward compatibility but don't use it)
5. The existing `t.*` calls should still work since the dictionary keys are the same

5. Run `pnpm type-check` and fix any errors.

Report to: `.superpowers/sdd/task-10-report.md`
Return: status, commits, type-check results, concerns.
