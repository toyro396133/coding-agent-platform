### Task 13: Translate Dialog Components

**Files:**
- Modify: `components/api-keys-dialog.tsx`
- Modify: `components/sandboxes-dialog.tsx`
- Modify: `components/create-pr-dialog.tsx`
- Modify: `components/merge-pr-dialog.tsx`
- Modify: `components/revert-commit-dialog.tsx`
- Modify: `components/multi-repo-dialog.tsx`
- Modify: `components/open-repo-url-dialog.tsx`

For each dialog component:
1. Add `useLocale()` import and hook
2. Replace user-facing strings with dictionary calls:

**api-keys-dialog:**
- `'API Keys'` (title) → `t.dialogs.apiKeys.title`
- description → `t.dialogs.apiKeys.description`
- `'Add API Key'` → `t.dialogs.apiKeys.addKey`
- `'Provider'` → `t.dialogs.apiKeys.provider`
- `'Key'` → `t.dialogs.apiKeys.key`
- `'API keys saved.'` → `t.dialogs.apiKeys.saved`
- `'No API keys configured.'` → `t.dialogs.apiKeys.noKeys`
- `'Save'` → `t.common.save`
- `'Cancel'` → `t.common.cancel`

**sandboxes-dialog:**
- `'Sandboxes'` → `t.dialogs.sandboxes.title`
- description → `t.dialogs.sandboxes.description`
- `'No active sandboxes.'` → `t.dialogs.sandboxes.noSandboxes`
- `'Stop'` → `t.dialogs.sandboxes.stop`
- `'Sandbox stopped.'` → `t.dialogs.sandboxes.stopped`

**create-pr-dialog:**
- title → `t.dialogs.createPR.title`
- description → `t.dialogs.createPR.description`
- `'PR Title'` → `t.dialogs.createPR.titleLabel`
- `'PR Description'` → `t.dialogs.createPR.bodyLabel`
- `'Branch Name'` → `t.dialogs.createPR.branchLabel`
- `'Creating...'` → `t.dialogs.createPR.creating`
- success → `t.dialogs.createPR.created`
- error → `t.dialogs.createPR.failed`

**merge-pr-dialog:**
- title → `t.dialogs.mergePR.title`
- description → `t.dialogs.mergePR.description`
- confirm → `t.dialogs.mergePR.confirmMerge`
- `'Merging...'` → `t.dialogs.mergePR.merging`
- success → `t.dialogs.mergePR.merged`
- error → `t.dialogs.mergePR.failed`

**revert-commit-dialog:**
- title → `t.dialogs.revertCommit.title`
- description → `t.dialogs.revertCommit.description`
- confirm → `t.dialogs.revertCommit.confirmRevert`
- `'Reverting...'` → `t.dialogs.revertCommit.reverting`
- success → `t.dialogs.revertCommit.reverted`
- error → `t.dialogs.revertCommit.failed`

**multi-repo-dialog:**
- title → `t.dialogs.multiRepo.title`
- description → `t.dialogs.multiRepo.description`
- `'No repositories available.'` → `t.dialogs.multiRepo.noRepos`
- `'selected'` → `t.dialogs.multiRepo.selected`
- action → `t.dialogs.multiRepo.runOnAll`

**open-repo-url-dialog:**
- title → `t.dialogs.openRepoUrl.title`
- description → `t.dialogs.openRepoUrl.description`
- `'Repository URL'` → `t.dialogs.openRepoUrl.urlLabel`
- `'https://github.com/owner/repo'` → `t.dialogs.openRepoUrl.placeholder`
- `'Open'` → `t.dialogs.openRepoUrl.open`
- `'Cancel'` → `t.common.cancel`

3. Replace `mr-2` with `me-2` for RTL

4. Run `pnpm type-check` and fix any errors.

Report to: `.superpowers/sdd/task-13-report.md`
Return: status, commits, type-check results, concerns.
