### Task 12: Translate Repo Components

**Files:**
- Modify: `components/repo-layout.tsx`
- Modify: `components/repo-commits.tsx` (if exists)
- Modify: `components/repo-issues.tsx` (if exists)
- Modify: `components/repo-pull-requests.tsx` (if exists)

**In `repo-layout.tsx`:**
1. Add `useLocale()` import and hook
2. Replace:
- `'Commits'` → `t.repos.commits`
- `'Issues'` → `t.repos.issues`
- `'Pull Requests'` → `t.repos.pullRequests`
- `'Create new task with this repository'` (title) → `t.repos.createNewTask`
- `aria-label` → `t.repos.createNewTask`

**In repo component pages** (commits, issues, pull-requests):
1. Add `useLocale()` import and hook
2. Replace all user-facing strings with dictionary calls:
- `'No commits found.'` → `t.repos.noCommits`
- `'No issues found.'` → `t.repos.noIssues`
- `'No pull requests found.'` → `t.repos.noPullRequests`
- `'by'` → `t.repos.by`
- `'Authored'` → `t.repos.authored`
- `'State'` → `t.repos.state`
- `'Open'` → `t.repos.open`
- `'Closed'` → `t.repos.closed`
- `'Merged'` → `t.repos.merged`
- `'Drafts'` → `t.repos.drafts`

3. Run `pnpm type-check` and fix any errors.

Report to: `.superpowers/sdd/task-12-report.md`
Return: status, commits, type-check results, concerns.
