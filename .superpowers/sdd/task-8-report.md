Task 8: Sidebar  
Status: ✅ Complete  
Modified: `components/task-sidebar.tsx`, `components/app-layout.tsx`  
Added `useLocale()` imports and translation calls:  
- Tab labels: "Tasks" → `t.sidebar.tasks`, "Repos" → `t.sidebar.repos`  
- Dialog/title: "Delete Tasks" → `t.sidebar.deleteDialogTitle`  
- Descriptions: "Select which types of tasks you want to delete..." → `t.sidebar.deleteDialogDesc`  
- Buttons: "New Task" → `t.sidebar.newTask`, "Delete Tasks" → `t.sidebar.deleteTasks`  
- Empty states: "No tasks yet. Create your first task!" → `t.sidebar.noTasksYet`, etc.  
- Search: "Search repos..." → `t.sidebar.searchRepos`  
- Connect: "Connect GitHub to view your repositories" → `t.sidebar.connectGitHubToView`  
- Badges: "Private" → `t.sidebar.private`  
- Count: "task"/"tasks" → `{count} {t.sidebar.task}` with pluralization  
- Toasts: "Failed to delete tasks" → `t.errors.failedToDeleteTasks`  
- All `mr-2` replaced with `me-2` for RTL.  
**No new type-check errors.**  
