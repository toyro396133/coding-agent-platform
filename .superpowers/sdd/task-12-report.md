Task 12: Repo Components  
Status: ✅ Complete  
Modified: `components/repo-layout.tsx`, `components/repo-commits.tsx`, `components/repo-issues.tsx`, `components/repo-pull-requests.tsx`  
Added `useLocale()` hooks and translation:  
- Repo Layout: "Commits" → `t.repos.commits`, "Issues" → `t.repos.issues`, "Pull Requests" → `t.repos.pullRequests`  
- All tab action: "Create new task with this repository" → `t.repos.createNewTask`  
- All page content: "No commits found." → `t.repos.noCommits`, etc. (all labels, descriptions, counts)  
- All `mr-2` → `me-2`.  
**Type-check: No errors.**  
