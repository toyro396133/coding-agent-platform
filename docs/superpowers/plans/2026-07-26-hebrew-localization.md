# Hebrew Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full Hebrew (RTL) localization of the UI with user-based locale persistence

**Architecture:** Expand dictionary pattern with separate `en.ts`/`he.ts` files, add LocaleProvider + Jotai atom for zero-prop-drilling translation access, store user preference in DB, add locale toggle to user menu.

**Tech Stack:** Next.js 16, Jotai, Drizzle ORM, shadcn/ui, Tailwind CSS

## Global Constraints

- No dynamic values in log messages (per AGENTS.md)
- Run `pnpm format`, `pnpm type-check`, `pnpm lint` after changes
- Root layout already has `lang="he" dir="rtl"` — do not change
- Use `me-*`/`ms-*` instead of `mr-*`/`ml-*` for RTL compat
- Dictionary keys in lowercase camelCase, organized by domain

---

### Task 1: Dictionary Files (en.ts + he.ts + index.ts)

**Files:**
- Create: `dictionaries/en.ts`
- Create: `dictionaries/he.ts`
- Modify: `dictionaries/index.ts`

**Interfaces:**
- Produces: `Locale` type (`'en' | 'he'`), `getDictionary(locale)` function, typed dictionary objects with hierarchical keys

- [ ] **Step 1: Create `dictionaries/en.ts`** with ALL English strings organized by domain

```typescript
export const en = {
  common: {
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    search: 'Search...',
    signIn: 'Sign in',
    signOut: 'Log Out',
    close: 'Close',
    back: 'Back',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    noResults: 'No results found',
    or: 'Or',
    creating: 'Creating...',
    deleting: 'Deleting...',
    searching: 'Searching...',
    refreshing: 'Refreshing...',
    comingSoon: 'More settings coming soon.',
    tasks: 'Tasks',
    repos: 'Repos',
    loadingRoutes: 'Loading routes...',
    loadingEllipsis: 'Loading...',
  },
  home: {
    title: 'Coding Agent Template',
    subtitle:
      'Multi-agent AI coding platform powered by Vercel Sandbox and AI Gateway',
    newRepo: 'New Repo',
    openRepoUrl: 'Open Repo URL',
    refreshOwners: 'Refresh Owners',
    refreshRepos: 'Refresh Repos',
    manageAccess: 'Manage Access',
    disconnectGitHub: 'Disconnect GitHub',
    connectGitHub: 'Connect GitHub',
    signInTitle: 'Sign in to continue',
    signInDescVercelGitHub: 'You need to sign in to create tasks. Choose how you want to sign in.',
    signInDescVercel: 'You need to sign in with Vercel to create tasks.',
    signInDescGitHub: 'You need to sign in with GitHub to create tasks.',
    signInWithVercel: 'Sign in with Vercel',
    signInWithGitHub: 'Sign in with GitHub',
    signInRequired: 'Sign in required',
    signInRequiredDesc: 'Please sign in to create tasks with custom repository URLs.',
    selectRepos: 'Please select repositories',
    selectReposDesc: 'Click on "0 repos selected" to choose repositories.',
    selectRepoDesc: 'Choose a GitHub repository to work with from the header.',
    taskCreated: 'Task created successfully!',
    tasksCreated: 'tasks created successfully!',
    tasksCreatedFailed: 'tasks created, failed',
    failedToCreateTask: 'Failed to create task',
    failedToCreateTasks: 'Failed to create tasks',
    gitHubConnected: 'GitHub account connected successfully!',
    gitHubDisconnected: 'GitHub disconnected',
    refreshingOwners: 'Refreshing owners...',
    refreshingRepos: 'Refreshing repositories...',
    refreshingAllRepos: 'Refreshing all repositories...',
    moreOptions: 'More options',
    workOnThisRepo: 'Work on this repository',
  },
  taskForm: {
    promptPlaceholder: 'Describe what you want the AI agent to do...',
    agent: 'Agent',
    model: 'Model',
    compare: 'Compare',
    selectModels: 'Select models',
    selected: 'Selected',
    agentBrowser: 'Agent Browser',
    mcpServers: 'MCP Servers',
    taskOptions: 'Task Options',
    installDependencies: 'Install Dependencies?',
    maxDuration: 'Maximum Duration',
    keepAlive: 'Keep Alive',
    keepAliveHint: 'Keep sandbox running after completion.',
    skipInstall: 'Skip Install',
    minutes: 'minutes',
    hour: 'hour',
    hours: 'hours',
    selectAtLeastOneModel: 'Please select at least one model for multi-agent mode',
    apiKeyRequired: 'API key required',
    apiKeyRequiredDesc: 'Please add your {provider} API key in the user menu to use the {agent} agent with this model.',
    multiAgentInfo: 'This will create {count} separate task{plural} (one for each selected model)',
  },
  sidebar: {
    tasks: 'Tasks',
    repos: 'Repos',
    newTask: 'New Task',
    deleteTasks: 'Delete Tasks',
    viewAllTasks: 'View All Tasks',
    noTasksYet: 'No tasks yet. Create your first task!',
    signInToViewTasks: 'Sign in to view and create tasks',
    signInToViewRepos: 'Sign in to view repositories',
    searchRepos: 'Search repos...',
    noReposFound: 'No repositories found',
    noReposMatch: 'No repos match "{query}"',
    loadingRepositories: 'Loading repositories...',
    connectGitHubToView: 'Connect GitHub to view your repositories',
    private: 'Private',
    task: 'task',
    deleteDialogTitle: 'Delete Tasks',
    deleteDialogDesc: 'Select which types of tasks you want to delete. This action cannot be undone.',
    deleteCompleted: 'Delete Completed Tasks',
    deleteFailed: 'Delete Failed Tasks',
    deleteStopped: 'Delete Stopped Tasks',
    unknownRepo: 'Unknown repository',
    invalidRepoUrl: 'Invalid repository URL',
  },
  taskDetails: {
    notFound: 'Task Not Found',
    notFoundDesc: 'The requested task could not be found.',
    files: 'Files',
    code: 'Code',
    preview: 'Preview',
    chat: 'Chat',
    logs: 'Logs',
    createPR: 'Create PR',
    mergePR: 'Merge PR',
    revertCommit: 'Revert Commit',
    stop: 'Stop',
    restart: 'Restart',
    delete: 'Delete',
    maximize: 'Maximize',
    minimize: 'Minimize',
    deploy: 'Deploy',
    openSandbox: 'Open Sandbox',
    openPreview: 'Open Preview',
    invalidUrl: 'Invalid URL',
    sandboxStatus: 'Sandbox Status',
    prStatus: 'PR Status',
    taskProgress: 'Task Progress',
    agent: 'Agent',
    model: 'Model',
    repository: 'Repository',
    duration: 'Duration',
    branch: 'Branch',
    noLogs: 'No logs available.',
  },
  taskChat: {
    inputPlaceholder: 'Type a message...',
    send: 'Send',
    optimize: 'Optimize',
    stop: 'Stop',
    copy: 'Copy',
    copied: 'Copied',
    retry: 'Retry',
    enhancePrompt: 'Enhance Prompt',
    optimizing: 'Optimizing...',
    autoRemediate: 'Auto-Remediate',
  },
  settings: {
    title: 'Settings',
    description: 'Manage your account settings and agent routing preferences.',
    general: 'General',
    agentRouting: 'Agent Routing',
    users: 'Users',
    generalSettings: 'General Settings',
    generalDesc: 'Configure basic platform settings.',
    routingTitle: 'Multi-Model Sub-Agent Routing',
    routingDesc:
      'Customize which LLM handles dynamically spawned background tasks. The Orchestrator automatically discovers and delegates new sub-tasks as needed.',
    locale: 'Language / שפה',
    localeDesc: 'Choose your preferred display language.',
    hebrew: 'עברית',
    english: 'English',
  },
  auth: {
    signIn: 'Sign in',
    signInTitle: 'Sign in',
    signInDesc: 'Choose how you want to sign in to continue.',
    signInVercelDesc: 'Sign in with Vercel to continue.',
    signInGitHubDesc: 'Sign in with GitHub to continue.',
    signInPasswordTitle: 'Sign in with Password',
    signInPasswordDesc: 'Enter your username and password to sign in.',
    signInWithVercel: 'Sign in with Vercel',
    signInWithGitHub: 'Sign in with GitHub',
    signInWithPassword: 'Sign in with Password',
    apiKeys: 'API Keys',
    sandboxes: 'Sandboxes',
    logOut: 'Log Out',
    disconnect: 'Disconnect',
    connect: 'Connect',
    youHaveBeenLoggedOut: 'You have been logged out.',
    gitHubDisconnected: 'GitHub disconnected',
    failedToDisconnectGitHub: 'Failed to disconnect GitHub',
    messagesRemaining: '{remaining}/{total} messages remaining today',
  },
  repos: {
    commits: 'Commits',
    issues: 'Issues',
    pullRequests: 'Pull Requests',
    createNewTask: 'Create new task with this repository',
    noCommits: 'No commits found.',
    noIssues: 'No issues found.',
    noPullRequests: 'No pull requests found.',
    by: 'by',
    authored: 'Authored',
    state: 'State',
    open: 'Open',
    closed: 'Closed',
    merged: 'Merged',
    drafts: 'Drafts',
  },
  dialogs: {
    apiKeys: {
      title: 'API Keys',
      description: 'Manage your API keys for AI providers.',
      addKey: 'Add API Key',
      provider: 'Provider',
      key: 'Key',
      saved: 'API keys saved.',
      noKeys: 'No API keys configured.',
    },
    sandboxes: {
      title: 'Sandboxes',
      description: 'View and manage your active sandboxes.',
      noSandboxes: 'No active sandboxes.',
      stop: 'Stop',
      stopped: 'Sandbox stopped.',
    },
    createPR: {
      title: 'Create Pull Request',
      description: 'Create a pull request from the current changes.',
      titleLabel: 'PR Title',
      bodyLabel: 'PR Description',
      branchLabel: 'Branch Name',
      creating: 'Creating...',
      created: 'Pull request created successfully!',
      failed: 'Failed to create pull request',
    },
    mergePR: {
      title: 'Merge Pull Request',
      description: 'Merge this pull request.',
      confirmMerge: 'Are you sure you want to merge this pull request?',
      merging: 'Merging...',
      merged: 'Pull request merged successfully!',
      failed: 'Failed to merge pull request',
    },
    revertCommit: {
      title: 'Revert Commit',
      description: 'Revert this commit.',
      confirmRevert: 'Are you sure you want to revert this commit?',
      reverting: 'Reverting...',
      reverted: 'Commit reverted successfully!',
      failed: 'Failed to revert commit',
    },
    multiRepo: {
      title: 'Multi-Repo Mode',
      description: 'Select multiple repositories to run tasks on.',
      noRepos: 'No repositories available.',
      selected: 'selected',
      runOnAll: 'Run on selected repositories',
    },
    openRepoUrl: {
      title: 'Open Repository URL',
      description: 'Enter a GitHub repository URL to work with.',
      urlLabel: 'Repository URL',
      placeholder: 'https://github.com/owner/repo',
      open: 'Open',
    },
  },
  errors: {
    taskNotFound: 'The requested task could not be found.',
    failedToCreateTask: 'Failed to create task',
    failedToCreateTasks: 'Failed to create tasks',
    failedToDeleteTasks: 'Failed to delete tasks',
    failedToDisconnectGitHub: 'Failed to disconnect GitHub',
    failedToConnectGitHub: 'Failed to connect GitHub',
    failedToFetchRepos: 'Failed to fetch repositories',
    failedToFetchPRs: 'Failed to fetch pull requests',
    failedToFetchIssues: 'Failed to fetch issues',
    failedToFetchCommits: 'Failed to fetch commits',
    failedToStopTask: 'Failed to stop task',
    failedToRestartTask: 'Failed to restart task',
    failedToDeleteTask: 'Failed to delete task',
    failedToUpdateLocale: 'Failed to update language preference',
  },
  toasts: {
    taskCreated: 'Task created successfully!',
    tasksCreated: '{count} tasks created successfully!',
    tasksCreatedWarning: '{success} tasks created, {failed} failed',
    tasksDeleted: 'Tasks deleted successfully',
    gitHubConnected: 'GitHub account connected successfully!',
    gitHubDisconnected: 'GitHub disconnected',
    sandboxStopped: 'Sandbox stopped',
    prCreated: 'Pull request created successfully!',
    prMerged: 'Pull request merged successfully!',
    commitReverted: 'Commit reverted successfully!',
    apiKeysSaved: 'API keys saved',
    signedOut: 'You have been logged out.',
    localeUpdated: 'Language preference updated',
    refreshingOwners: 'Refreshing owners...',
    refreshingRepos: 'Refreshing repositories...',
    refreshingAllRepos: 'Refreshing all repositories...',
  },
} as const
```

- [ ] **Step 2: Create `dictionaries/he.ts`** with ALL Hebrew translations

```typescript
import type { en } from './en'

export type Dictionary = typeof en

export const he: Dictionary = {
  common: {
    loading: 'טוען...',
    save: 'שמור',
    cancel: 'ביטול',
    delete: 'מחק',
    search: 'חיפוש...',
    signIn: 'התחבר',
    signOut: 'התנתק',
    close: 'סגור',
    back: 'חזור',
    error: 'שגיאה',
    success: 'הצלחה',
    warning: 'אזהרה',
    noResults: 'לא נמצאו תוצאות',
    or: 'או',
    creating: 'יוצר...',
    deleting: 'מוחק...',
    searching: 'מחפש...',
    refreshing: 'מרענן...',
    comingSoon: 'עוד הגדרות בקרוב.',
    tasks: 'משימות',
    repos: 'מאגרים',
    loadingRoutes: 'טוען נתיבים...',
    loadingEllipsis: 'טוען...',
  },
  home: {
    title: 'תבנית סוכן קוד',
    subtitle:
      'פלטפורמת קוד רב-סוכנית מבוססת AI, מופעלת על ידי Vercel Sandbox ו-AI Gateway',
    newRepo: 'מאגר חדש',
    openRepoUrl: 'פתח כתובת מאגר',
    refreshOwners: 'רענן בעלים',
    refreshRepos: 'רענן מאגרים',
    manageAccess: 'ניהול גישה',
    disconnectGitHub: 'נתק את GitHub',
    connectGitHub: 'התחבר ל-GitHub',
    signInTitle: 'התחבר כדי להמשיך',
    signInDescVercelGitHub: 'עליך להתחבר כדי ליצור משימות. בחר כיצד ברצונך להתחבר.',
    signInDescVercel: 'עליך להתחבר עם Vercel כדי ליצור משימות.',
    signInDescGitHub: 'עליך להתחבר עם GitHub כדי ליצור משימות.',
    signInWithVercel: 'התחבר עם Vercel',
    signInWithGitHub: 'התחבר עם GitHub',
    signInRequired: 'נדרשת התחברות',
    signInRequiredDesc: 'אנא התחבר כדי ליצור משימות עם כתובות מאגר מותאמות אישית.',
    selectRepos: 'אנא בחר מאגרים',
    selectReposDesc: 'לחץ על "0 מאגרים נבחרו" כדי לבחור מאגרים.',
    selectRepoDesc: 'בחר מאגר GitHub לעבודה מהכותרת.',
    taskCreated: 'המשימה נוצרה בהצלחה!',
    tasksCreated: 'משימות נוצרו בהצלחה!',
    tasksCreatedFailed: 'משימות נוצרו, נכשלו',
    failedToCreateTask: 'נכשל ביצירת המשימה',
    failedToCreateTasks: 'נכשל ביצירת המשימות',
    gitHubConnected: 'חשבון GitHub התחבר בהצלחה!',
    gitHubDisconnected: 'החשבון GitHub נותק',
    refreshingOwners: 'מרענן בעלים...',
    refreshingRepos: 'מרענן מאגרים...',
    refreshingAllRepos: 'מרענן את כל המאגרים...',
    moreOptions: 'אפשרויות נוספות',
    workOnThisRepo: 'עבוד על מאגר זה',
  },
  taskForm: {
    promptPlaceholder: 'תאר מה אתה רוצה שהסוכן AI יעשה...',
    agent: 'סוכן',
    model: 'מודל',
    compare: 'השוואה',
    selectModels: 'בחר מודלים',
    selected: 'נבחרו',
    agentBrowser: 'דפדפן סוכן',
    mcpServers: 'שרתי MCP',
    taskOptions: 'אפשרויות משימה',
    installDependencies: 'להתקין תלויות?',
    maxDuration: 'משך מקסימלי',
    keepAlive: 'השאר פעיל',
    keepAliveHint: 'השאר את הארגז חול פעיל לאחר הסיום.',
    skipInstall: 'דלג על התקנה',
    minutes: 'דקות',
    hour: 'שעה',
    hours: 'שעות',
    selectAtLeastOneModel: 'אנא בחר לפחות מודל אחד למצב רב-סוכן',
    apiKeyRequired: 'נדרש מפתח API',
    apiKeyRequiredDesc: 'אנא הוסף מפתח API של {provider} בתפריט המשתמש כדי להשתמש בסוכן {agent} עם מודל זה.',
    multiAgentInfo: 'פעולה זו תיצור {count} משימות נפרדות (אחת עבור כל מודל נבחר)',
  },
  sidebar: {
    tasks: 'משימות',
    repos: 'מאגרים',
    newTask: 'משימה חדשה',
    deleteTasks: 'מחק משימות',
    viewAllTasks: 'צפה בכל המשימות',
    noTasksYet: 'אין עדיין משימות. צור את המשימה הראשונה שלך!',
    signInToViewTasks: 'התחבר כדי לצפות וליצור משימות',
    signInToViewRepos: 'התחבר כדי לצפות במאגרים',
    searchRepos: 'חפש מאגרים...',
    noReposFound: 'לא נמצאו מאגרים',
    noReposMatch: 'לא נמצאו מאגרים התואמים ל-"{query}"',
    loadingRepositories: 'טוען מאגרים...',
    connectGitHubToView: 'התחבר ל-GitHub כדי לצפות במאגרים שלך',
    private: 'פרטי',
    task: 'משימה',
    deleteDialogTitle: 'מחק משימות',
    deleteDialogDesc: 'בחר אילו סוגי משימות ברצונך למחוק. פעולה זו אינה ניתנת לביטול.',
    deleteCompleted: 'מחק משימות שהושלמו',
    deleteFailed: 'מחק משימות שנכשלו',
    deleteStopped: 'מחק משימות שהופסקו',
    unknownRepo: 'מאגר לא ידוע',
    invalidRepoUrl: 'כתובת מאגר לא תקינה',
  },
  taskDetails: {
    notFound: 'המשימה לא נמצאה',
    notFoundDesc: 'המשימה המבוקשת לא נמצאה.',
    files: 'קבצים',
    code: 'קוד',
    preview: 'תצוגה מקדימה',
    chat: 'צ\'אט',
    logs: 'לוגים',
    createPR: 'צור PR',
    mergePR: 'מזג PR',
    revertCommit: 'בטל קומיט',
    stop: 'עצור',
    restart: 'הפעל מחדש',
    delete: 'מחק',
    maximize: 'הגדל',
    minimize: 'הקטן',
    deploy: 'בצע Deploy',
    openSandbox: 'פתח ארגז חול',
    openPreview: 'פתח תצוגה מקדימה',
    invalidUrl: 'כתובת לא תקינה',
    sandboxStatus: 'סטטוס ארגז חול',
    prStatus: 'סטטוס PR',
    taskProgress: 'התקדמות משימה',
    agent: 'סוכן',
    model: 'מודל',
    repository: 'מאגר',
    duration: 'משך',
    branch: 'ענף',
    noLogs: 'אין לוגים זמינים.',
  },
  taskChat: {
    inputPlaceholder: 'הקלד הודעה...',
    send: 'שלח',
    optimize: 'שפר',
    stop: 'עצור',
    copy: 'העתק',
    copied: 'הועתק',
    retry: 'נסה שוב',
    enhancePrompt: 'שדרג הנחיה',
    optimizing: 'משפר...',
    autoRemediate: 'תיקון אוטומטי',
  },
  settings: {
    title: 'הגדרות',
    description: 'נהל את הגדרות החשבון שלך והעדפות ניתוב הסוכנים.',
    general: 'כללי',
    agentRouting: 'ניתוב סוכנים',
    users: 'משתמשים',
    generalSettings: 'הגדרות כלליות',
    generalDesc: 'הגדר הגדרות פלטפורמה בסיסיות.',
    routingTitle: 'ניתוב תת-סוכנים רב-מודל',
    routingDesc:
      'התאם אישית איזה LLM מטפל במשימות רקע המתהוות באופן דינמי. המנהל מגלה אוטומטית ומקצה תת-משימות חדשות לפי הצורך.',
    locale: 'שפה',
    localeDesc: 'בחר את שפת התצוגה המועדפת עליך.',
    hebrew: 'עברית',
    english: 'English',
  },
  auth: {
    signIn: 'התחבר',
    signInTitle: 'התחבר',
    signInDesc: 'בחר כיצד ברצונך להתחבר כדי להמשיך.',
    signInVercelDesc: 'התחבר עם Vercel כדי להמשיך.',
    signInGitHubDesc: 'התחבר עם GitHub כדי להמשיך.',
    signInPasswordTitle: 'התחבר עם סיסמה',
    signInPasswordDesc: 'הזן את שם המשתמש והסיסמה שלך כדי להתחבר.',
    signInWithVercel: 'התחבר עם Vercel',
    signInWithGitHub: 'התחבר עם GitHub',
    signInWithPassword: 'התחבר עם סיסמה',
    apiKeys: 'מפתחות API',
    sandboxes: 'ארגזי חול',
    logOut: 'התנתק',
    disconnect: 'נתק',
    connect: 'התחבר',
    youHaveBeenLoggedOut: 'התנתקת בהצלחה.',
    gitHubDisconnected: 'GitHub נותק',
    failedToDisconnectGitHub: 'נכשל בניתוק GitHub',
    messagesRemaining: 'נותרו {remaining}/{total} הודעות היום',
  },
  repos: {
    commits: 'קומיטים',
    issues: 'תקלות',
    pullRequests: 'בקשות משיכה',
    createNewTask: 'צור משימה חדשה עם מאגר זה',
    noCommits: 'לא נמצאו קומיטים.',
    noIssues: 'לא נמצאו תקלות.',
    noPullRequests: 'לא נמצאו בקשות משיכה.',
    by: 'מאת',
    authored: 'נכתב על ידי',
    state: 'סטטוס',
    open: 'פתוח',
    closed: 'סגור',
    merged: 'מוזג',
    drafts: 'טיוטות',
  },
  dialogs: {
    apiKeys: {
      title: 'מפתחות API',
      description: 'נהל את מפתחות ה-API שלך עבור ספקי AI.',
      addKey: 'הוסף מפתח API',
      provider: 'ספק',
      key: 'מפתח',
      saved: 'מפתחות ה-API נשמרו.',
      noKeys: 'לא הוגדרו מפתחות API.',
    },
    sandboxes: {
      title: 'ארגזי חול',
      description: 'צפה ונהל את ארגזי החול הפעילים שלך.',
      noSandboxes: 'אין ארגזי חול פעילים.',
      stop: 'עצור',
      stopped: 'ארגז החול נעצר.',
    },
    createPR: {
      title: 'צור בקשת משיכה',
      description: 'צור בקשת משיכה מהשינויים הנוכחיים.',
      titleLabel: 'כותרת PR',
      bodyLabel: 'תיאור PR',
      branchLabel: 'שם ענף',
      creating: 'יוצר...',
      created: 'בקשת המשיכה נוצרה בהצלחה!',
      failed: 'נכשל ביצירת בקשת המשיכה',
    },
    mergePR: {
      title: 'מזג בקשת משיכה',
      description: 'מזג בקשת משיכה זו.',
      confirmMerge: 'האם אתה בטוח שברצונך למזג בקשת משיכה זו?',
      merging: 'ממזג...',
      merged: 'בקשת המשיכה מוזגה בהצלחה!',
      failed: 'נכשל במיזוג בקשת המשיכה',
    },
    revertCommit: {
      title: 'בטל קומיט',
      description: 'בטל קומיט זה.',
      confirmRevert: 'האם אתה בטוח שברצונך לבטל קומיט זה?',
      reverting: 'מבטל...',
      reverted: 'הקומיט בוטל בהצלחה!',
      failed: 'נכשל בביטול הקומיט',
    },
    multiRepo: {
      title: 'מצב רב-מאגרים',
      description: 'בחר מספר מאגרים להרצת משימות עליהם.',
      noRepos: 'אין מאגרים זמינים.',
      selected: 'נבחרו',
      runOnAll: 'הרץ על המאגרים הנבחרים',
    },
    openRepoUrl: {
      title: 'פתח כתובת מאגר',
      description: 'הזן כתובת מאגר GitHub לעבודה.',
      urlLabel: 'כתובת מאגר',
      placeholder: 'https://github.com/owner/repo',
      open: 'פתח',
    },
  },
  errors: {
    taskNotFound: 'המשימה המבוקשת לא נמצאה.',
    failedToCreateTask: 'נכשל ביצירת המשימה',
    failedToCreateTasks: 'נכשל ביצירת המשימות',
    failedToDeleteTasks: 'נכשל במחיקת המשימות',
    failedToDisconnectGitHub: 'נכשל בניתוק GitHub',
    failedToConnectGitHub: 'נכשל בהתחברות ל-GitHub',
    failedToFetchRepos: 'נכשל בשליפת המאגרים',
    failedToFetchPRs: 'נכשל בשליפת בקשות המשיכה',
    failedToFetchIssues: 'נכשל בשליפת התקלות',
    failedToFetchCommits: 'נכשל בשליפת הקומיטים',
    failedToStopTask: 'נכשל בעצירת המשימה',
    failedToRestartTask: 'נכשל בהפעלה מחדש של המשימה',
    failedToDeleteTask: 'נכשל במחיקת המשימה',
    failedToUpdateLocale: 'נכשל בעדכון העדפת השפה',
  },
  toasts: {
    taskCreated: 'המשימה נוצרה בהצלחה!',
    tasksCreated: '{count} משימות נוצרו בהצלחה!',
    tasksCreatedWarning: '{success} משימות נוצרו, {failed} נכשלו',
    tasksDeleted: 'המשימות נמחקו בהצלחה',
    gitHubConnected: 'חשבון GitHub התחבר בהצלחה!',
    gitHubDisconnected: 'GitHub נותק',
    sandboxStopped: 'ארגז החול נעצר',
    prCreated: 'בקשת המשיכה נוצרה בהצלחה!',
    prMerged: 'בקשת המשיכה מוזגה בהצלחה!',
    commitReverted: 'הקומיט בוטל בהצלחה!',
    apiKeysSaved: 'מפתחות ה-API נשמרו',
    signedOut: 'התנתקת בהצלחה.',
    localeUpdated: 'העדפת השפה עודכנה',
    refreshingOwners: 'מרענן בעלים...',
    refreshingRepos: 'מרענן מאגרים...',
    refreshingAllRepos: 'מרענן את כל המאגרים...',
  },
}
```

- [ ] **Step 3: Update `dictionaries/index.ts`** to re-export types and `getDictionary`

```typescript
export type { Dictionary } from './en'
export { en } from './en'
export { he } from './he'

export type Locale = 'en' | 'he'

const dictionaries = { en: () => import('./en').then((m) => m.en), he: () => import('./he').then((m) => m.he) }

export const getDictionary = (locale: Locale) => {
  if (locale === 'he') return he
  return en
}

export type TranslationKey = {
  [K in keyof typeof en]: {
    [SubK in keyof (typeof en)[K]]: string
  }
}
```

Wait — simpler approach: just import statically since these are small files:

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

- [ ] **Step 5: Commit**

```bash
git add dictionaries/
git commit -m "feat: add comprehensive EN/HE dictionary files with all UI strings"
```

---

### Task 2: Database + Session + API for Locale

**Files:**
- Modify: `lib/db/schema.ts` — add `locale` column to users table
- Modify: `lib/db/users.ts` — handle locale field
- Modify: `lib/session/types.ts` — add locale to Session/User type
- Create: `app/api/user/locale/route.ts` — PATCH endpoint
- Modify: relevant session files to read locale from DB

**Interfaces:**
- Produces: DB migration for locale column, `PATCH /api/user/locale` endpoint returning `{ success: true }`, `User` type including `locale: string`

- [ ] **Step 1: Add `locale` field to `lib/db/schema.ts` users table**

After `passwordHash: text('password_hash')`, add:
```typescript
locale: text('locale').default('he').notNull(),
```

Also update `insertUserSchema`:
```typescript
locale: z.enum(['en', 'he']).optional(),
```

And update `selectUserSchema` if it exists (check the file).

- [ ] **Step 2: Add `locale` to `lib/session/types.ts`**

Update `User` interface:
```typescript
interface User {
  id: string
  username: string
  email: string | undefined
  avatar: string
  name?: string
  locale?: 'en' | 'he'
}
```

- [ ] **Step 3: Read locale from DB when building session**

In the session creation code (find where `getServerSession()` fetches user data), include the locale field. Search for the user query that builds the session object and add `locale: user.locale`.

- [ ] **Step 4: Create `app/api/user/locale/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { updateUserLocale } from '@/lib/db/users'

export async function PATCH(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { locale } = await request.json()
  if (locale !== 'en' && locale !== 'he') {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }

  await updateUserLocale(session.user.id, locale)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Add `updateUserLocale` function to `lib/db/users.ts`**

```typescript
export async function updateUserLocale(userId: string, locale: 'en' | 'he') {
  return await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId))
}
```

- [ ] **Step 6: Run migration and verify build**

Run: `pnpm db:generate` and `pnpm db:push` (or skip if using `db:push`)
Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/users.ts lib/session/types.ts app/api/user/locale/route.ts
git commit -m "feat: add locale field to user schema, session, and API endpoint"
```

---

### Task 3: LocaleProvider + useLocale hook

**Files:**
- Create: `components/providers/locale-provider.tsx`
- Modify: `app/layout.tsx` — wrap with LocaleProvider

**Interfaces:**
- Produces: `LocaleProvider` component, `useLocale()` hook returning `{ t, locale, setLocale }` where `t` is the dictionary object

- [ ] **Step 1: Create `components/providers/locale-provider.tsx`**

```typescript
'use client'

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { getDictionary, type Locale } from '@/dictionaries'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { toast } from 'sonner'

// Atom that syncs with localStorage as fallback, but primarily set from server
export const localeAtom = atomWithStorage<Locale>('locale', 'he')

interface LocaleContextType {
  t: ReturnType<typeof getDictionary>
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
}

const LocaleContext = createContext<LocaleContextType | null>(null)

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleAtom] = useAtom(localeAtom)

  // Initialize from server if available
  const [initialized, setInitialized] = useState(false)

  if (!initialized && initialLocale) {
    setLocaleAtom(initialLocale)
    setInitialized(true)
  }

  const t = useMemo(() => getDictionary(locale), [locale])

  const setLocale = useCallback(
    async (newLocale: Locale) => {
      setLocaleAtom(newLocale)
      try {
        const response = await fetch('/api/user/locale', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: newLocale }),
        })
        if (!response.ok) {
          toast.error(t.errors.failedToUpdateLocale)
        }
      } catch {
        toast.error(t.errors.failedToUpdateLocale)
      }
    },
    [setLocaleAtom, t.errors.failedToUpdateLocale],
  )

  return (
    <LocaleContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextType {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}
```

- [ ] **Step 2: Wrap app layout with LocaleProvider**

In `app/layout.tsx`, add import and wrap children:

```typescript
import { LocaleProvider } from '@/components/providers/locale-provider'
```

Wrap in `LocaleProvider` (inside `JotaiProvider`, outside `ThemeProvider`):
```typescript
<JotaiProvider>
  <LocaleProvider>
    <ThemeProvider ...>
      ...
    </ThemeProvider>
  </LocaleProvider>
</JotaiProvider>
```

- [ ] **Step 3: Pass server locale to LocaleProvider (optional enhancement)**

In server components that render client children, pass the session locale. For now, the atom initializes from localStorage which defaults to 'he'.

- [ ] **Step 4: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add components/providers/locale-provider.tsx app/layout.tsx
git commit -m "feat: add LocaleProvider with useLocale hook"
```

---

### Task 4: LocaleToggle in User Menu

**Files:**
- Create: `components/locale-toggle.tsx`
- Modify: `components/auth/sign-out.tsx` — add LocaleToggle to dropdown

- [ ] **Step 1: Create `components/locale-toggle.tsx`**

```typescript
'use client'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useLocale } from '@/components/providers/locale-provider'
import { Languages } from 'lucide-react'

export function LocaleToggle() {
  const { locale, setLocale } = useLocale()

  return (
    <DropdownMenuItem
      onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
      className="cursor-pointer"
    >
      <Languages className="h-4 w-4 me-2" />
      {locale === 'he' ? 'English' : 'עברית'}
    </DropdownMenuItem>
  )
}
```

- [ ] **Step 2: Add LocaleToggle to `components/auth/sign-out.tsx`**

Add import:
```typescript
import { LocaleToggle } from '@/components/locale-toggle'
```

Add after `<ThemeToggle />` line (~line 136):
```typescript
<LocaleToggle />
```

- [ ] **Step 3: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/locale-toggle.tsx components/auth/sign-out.tsx
git commit -m "feat: add locale toggle in user dropdown menu"
```

---

### Task 5: Translate Shared Header + GitHub Stars

**Files:**
- Modify: `components/shared-header.tsx`
- Create or update: any remaining shared UI

- [ ] **Step 1: Update `shared-header.tsx`** to translate "Deploy Your Own"

```typescript
import { useLocale } from '@/components/providers/locale-provider'
```

In the component:
```typescript
const { t } = useLocale()
```

Replace `Deploy Your Own` with `{t.common.or}` — actually, use a proper key. Replace the span:
```typescript
<span className="hidden sm:inline">{t.home.deployYourOwn || 'Deploy Your Own'}</span>
```

Wait, I don't have `deployYourOwn` in the dictionary. Let me add it. Actually, `shared-header`'s "Deploy Your Own" is a brand/CTA string — it should be in the `home` domain. Let me add it.

Update `dictionaries/en.ts` → add to `home`:
```typescript
deployYourOwn: 'Deploy Your Own',
```

Update `dictionaries/he.ts` → add to `home`:
```typescript
deployYourOwn: 'Deploy משלך',
```

Then in shared-header use `{t.home.deployYourOwn}`.

- [ ] **Step 2: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/shared-header.tsx dictionaries/en.ts dictionaries/he.ts
git commit -m "feat: translate shared header component"
```

---

### Task 6: Translate Home Page Content

**Files:**
- Modify: `components/home-page-content.tsx`

- [ ] **Step 1: Add locale import and use `t()` for all strings**

Add at top:
```typescript
import { useLocale } from '@/components/providers/locale-provider'
```

In component:
```typescript
const { t } = useLocale()
```

Replace all user-facing strings:
- `'GitHub account connected successfully!'` → `t.home.gitHubConnected`
- `'Refreshing owners...'` → `t.home.refreshingOwners`
- `'Refreshing repositories...'` → `t.home.refreshingRepos`
- `'Refreshing all repositories...'` → `t.home.refreshingAllRepos`
- `'Sign in required'` → `t.home.signInRequired`
- `'Please sign in to create tasks with custom repository URLs.'` → `t.home.signInRequiredDesc`
- `'Task created successfully!'` → `t.home.taskCreated`
- `'More options'` → `t.home.moreOptions`
- All dropdown menu items: "New Repo", "Open Repo URL", "Refresh Owners", "Refresh Repos", "Manage Access", "Disconnect GitHub", "Connect GitHub"
- Sign in dialog title and descriptions
- "Sign in with Vercel", "Sign in with GitHub"

Replace `mr-2` with `me-2` for RTL icon spacing in dropdown items.

- [ ] **Step 2: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/home-page-content.tsx
git commit -m "feat: translate home page content component"
```

---

### Task 7: Translate Task Form

**Files:**
- Modify: `components/task-form.tsx`

- [ ] **Step 1: Add locale import and use `t()`**

```typescript
import { useLocale } from '@/components/providers/locale-provider'
const { t } = useLocale()
```

Replace all user-facing strings:
- `'Describe what you want the AI agent to do...'` → `t.taskForm.promptPlaceholder`
- `'Agent'` (SelectValue placeholder) → `t.taskForm.agent`
- `'Compare'` label → `t.taskForm.compare`
- `'Select models'` → `t.taskForm.selectModels`
- `'{n} Selected'` → `'{n} {t.taskForm.selected}'`
- `'Agent Browser'` → `t.taskForm.agentBrowser`
- `'MCP Servers'` → `t.taskForm.mcpServers`
- `'Task Options'` → `t.taskForm.taskOptions`
- `'Install Dependencies?'` → `t.taskForm.installDependencies`
- `'Maximum Duration'` → `t.taskForm.maxDuration`
- `'Keep Alive'` → `t.taskForm.keepAlive`
- `Keep alive hint` → `t.taskForm.keepAliveHint`
- `'Skip Install'` → `t.taskForm.skipInstall`
- `'Please select at least one model for multi-agent mode'` → `t.taskForm.selectAtLeastOneModel`
- Error toast messages → use dictionary keys
- Multi-agent info text → `t.taskForm.multiAgentInfo`
- Model labels (minutes, hour, hours) → `t.taskForm`

Also update the `CODING_AGENTS` "Compare" and model labels if needed (brand names like "Claude", "Codex" should stay in English, but UI labels like "Compare" translate).

- [ ] **Step 2: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/task-form.tsx
git commit -m "feat: translate task form component"
```

---

### Task 8: Translate Sidebar (TaskSidebar + AppLayout)

**Files:**
- Modify: `components/task-sidebar.tsx`
- Modify: `components/app-layout.tsx`

- [ ] **Step 1: Translate `app-layout.tsx`** — tab labels and button tooltips

Add `useLocale()` import, replace:
- `'Tasks'` → `t.sidebar.tasks`
- `'Repos'` → `t.sidebar.repos`
- `'New Task'` → `t.sidebar.newTask`
- `'Delete Tasks'` → `t.sidebar.deleteTasks`
- `'Delete Tasks'` (in SidebarLoader as well)

Replace `title="Delete Tasks"` and `title="New Task"` with dictionary calls.

- [ ] **Step 2: Translate `task-sidebar.tsx`**

Add `useLocale()` import, replace:
- All "Tasks"/"Repos" tab labels
- `'Search repos...'` → `t.sidebar.searchRepos`
- `'Delete Tasks'` → `t.sidebar.deleteTasks`
- `'New Task'` → `t.sidebar.newTask`
- `'Sign in to view and create tasks'` → `t.sidebar.signInToViewTasks`
- `'Sign in to view repositories'` → `t.sidebar.signInToViewRepos`
- `'No tasks yet. Create your first task!'` → `t.sidebar.noTasksYet`
- `'View All Tasks'` → `t.sidebar.viewAllTasks`
- `'Connect GitHub to view your repositories'` → `t.sidebar.connectGitHubToView`
- `'Loading repositories...'` / `'Searching...'` → dictionary
- `'No repositories found'` → `t.sidebar.noReposFound`
- `'No repos match "{query}"'` → `t.sidebar.noReposMatch`
- `'Unknown repository'` → `t.sidebar.unknownRepo`
- `'Invalid repository URL'` → `t.sidebar.invalidRepoUrl`
- Dialog title/description → `t.sidebar.deleteDialogTitle`, `t.sidebar.deleteDialogDesc`
- Checkbox labels → `t.sidebar.deleteCompleted`, `t.sidebar.deleteFailed`, `t.sidebar.deleteStopped`
- `'Delete Tasks'` button → `t.sidebar.deleteTasks`
- `'Cancel'` → `t.common.cancel`
- `'Deleting...'` → `t.common.deleting`
- `'Private'` badge → `t.sidebar.private`
- `task`/`tasks` count → `t.sidebar.task`
- Toast messages → `t.errors.*` or `t.toasts.*`

Replace `mr-2` with `me-2` for RTL icon spacing.

- [ ] **Step 3: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/task-sidebar.tsx components/app-layout.tsx
git commit -m "feat: translate sidebar components"
```

---

### Task 9: Translate Auth Components (SignIn + SignOut)

**Files:**
- Modify: `components/auth/sign-in.tsx`
- Modify: `components/auth/sign-out.tsx`

- [ ] **Step 1: Translate `sign-in.tsx`**

Add `useLocale()`, replace:
- `'Sign in'` button → `t.auth.signIn`
- `'Sign in with Password'` → `t.auth.signInWithPassword`
- `'Sign in with Vercel'` → `t.auth.signInWithVercel`
- `'Sign in with GitHub'` → `t.auth.signInWithGitHub`
- Dialog title → `t.auth.signInTitle`
- Dialog description → `t.auth.signInDesc` / `t.auth.signInVercelDesc` / `t.auth.signInGitHubDesc`
- `'Sign in with Password'` (title) → `t.auth.signInPasswordTitle`
- `'Enter your username and password to sign in.'` → `t.auth.signInPasswordDesc`
- `'Loading...'` → `t.common.loading`
- `'Or'` → `t.common.or`
- Replace `mr-2` with `me-2` for RTL

- [ ] **Step 2: Translate `sign-out.tsx`**

Add `useLocale()`, replace:
- `'{remaining}/{total} messages remaining today'` → `t.auth.messagesRemaining`
- `'API Keys'` → `t.auth.apiKeys`
- `'Sandboxes'` → `t.auth.sandboxes`
- `'Disconnect'` → `t.auth.disconnect`
- `'Connect'` → `t.auth.connect`
- `'Log Out'` → `t.auth.logOut`
- Toast messages → dictionary
- Replace `mr-2` with `me-2` for RTL

- [ ] **Step 3: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/auth/sign-in.tsx components/auth/sign-out.tsx
git commit -m "feat: translate auth components"
```

---

### Task 10: Translate Task Details + Task Chat

**Files:**
- Modify: `components/task-details.tsx`
- Modify: `components/task-chat.tsx`

- [ ] **Step 1: Translate `task-details.tsx`**

Add `useLocale()` import, replace all user-facing strings:
- `'Task Not Found'` → `t.taskDetails.notFound`
- `'The requested task could not be found.'` → `t.taskDetails.notFoundDesc`
- Tab labels: Files, Code, Preview, Chat, Logs → dictionary
- Button labels: Create PR, Merge PR, Revert Commit, Stop, Restart, Delete, etc.
- Various tooltip strings
- `'No logs available.'` → `t.taskDetails.noLogs`

- [ ] **Step 2: Translate `task-chat.tsx`** (already partially using getDictionary)

Replace the existing `getDictionary(locale)` usage with `useLocale()`:
```typescript
const { t } = useLocale()
```
Remove the `locale` prop (no longer needed) — but keep it or provide a default since parent components may pass it.

Actually, since task-chat already has `locale?: Locale` defaulting to `'he'`, just add the hook as fallback. Remove prop dependency:
```typescript
const { t } = useLocale()
// Remove: const t = getDictionary(locale)
```

All existing `t.` calls will continue to work since the dictionary keys are the same.

- [ ] **Step 3: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/task-details.tsx components/task-chat.tsx
git commit -m "feat: translate task details and chat components"
```

---

### Task 11: Translate Settings Page

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Translate settings page**

Since this is a server component, use `getDictionary` with the session locale:

```typescript
import { getDictionary, type Locale } from '@/dictionaries'
import { getServerSession } from '@/lib/session/get-server-session'

export default async function SettingsPage() {
  const session = await getServerSession()
  const locale = (session?.user?.locale || 'he') as Locale
  const t = getDictionary(locale)
  // ...
}
```

Replace:
- `'Settings'` → `t.settings.title`
- `'Manage your account settings...'` → `t.settings.description`
- `'General'` → `t.settings.general`
- `'Agent Routing'` → `t.settings.agentRouting`
- `'Users'` → `t.settings.users`
- `'General Settings'` → `t.settings.generalSettings`
- `'Configure basic platform settings.'` → `t.settings.generalDesc`
- `'Multi-Model Sub-Agent Routing'` → `t.settings.routingTitle`
- Routing description text
- `'Loading routes...'` → `t.common.loadingRoutes`
- `'Loading...'` → `t.common.loadingEllipsis`
- `'More settings coming soon.'` → `t.common.comingSoon`

- [ ] **Step 2: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: translate settings page"
```

---

### Task 12: Translate Repo Components

**Files:**
- Modify: `components/repo-layout.tsx`
- Modify: `components/repo-commits.tsx`
- Modify: `components/repo-issues.tsx`
- Modify: `components/repo-pull-requests.tsx`

- [ ] **Step 1: Translate `repo-layout.tsx`**

Add `useLocale()`, replace:
- `'Commits'` → `t.repos.commits`
- `'Issues'` → `t.repos.issues`
- `'Pull Requests'` → `t.repos.pullRequests`
- `'Create new task with this repository'` → `t.repos.createNewTask`
- `aria-label` → `t.repos.createNewTask`

- [ ] **Step 2: Translate repo tab pages** (commits, issues, pull-requests)

In each, add `useLocale()` and replace all user-facing strings with dictionary calls.

- [ ] **Step 3: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/repo-layout.tsx components/repo-commits.tsx components/repo-issues.tsx components/repo-pull-requests.tsx
git commit -m "feat: translate repo components"
```

---

### Task 13: Translate Dialogs

**Files:**
- Modify: `components/api-keys-dialog.tsx`
- Modify: `components/sandboxes-dialog.tsx`
- Modify: `components/create-pr-dialog.tsx`
- Modify: `components/merge-pr-dialog.tsx`
- Modify: `components/revert-commit-dialog.tsx`
- Modify: `components/multi-repo-dialog.tsx`
- Modify: `components/open-repo-url-dialog.tsx`

- [ ] **Step 1: Translate all dialog components**

For each dialog, add `useLocale()` and replace user-facing strings with dictionary keys under `t.dialogs.*`:
- Titles and descriptions
- Labels and placeholders
- Button text ("Cancel" → `t.common.cancel`)
- Toast/error messages
- Empty states

- [ ] **Step 2: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/api-keys-dialog.tsx components/sandboxes-dialog.tsx components/create-pr-dialog.tsx components/merge-pr-dialog.tsx components/revert-commit-dialog.tsx components/multi-repo-dialog.tsx components/open-repo-url-dialog.tsx
git commit -m "feat: translate dialog components"
```

---

### Task 14: Translate Remaining Components

**Files:**
- Modify: `components/github-stars-button.tsx`
- Modify: `components/connectors/manage-connectors.tsx`
- Modify: `components/terminal.tsx`
- Modify: `components/logs-pane.tsx`
- Modify: `components/file-browser.tsx`
- Modify: `components/file-diff-viewer.tsx`
- Modify: `components/file-editor.tsx`

- [ ] **Step 1: Translate remaining components**

For each component, add `useLocale()` and replace user-facing strings:
- Tooltips, placeholders, labels
- Button text, titles
- Error/empty state messages

- [ ] **Step 2: Verify build**

Run: `pnpm type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/github-stars-button.tsx components/connectors/manage-connectors.tsx components/terminal.tsx components/logs-pane.tsx components/file-browser.tsx components/file-diff-viewer.tsx components/file-editor.tsx
git commit -m "feat: translate remaining components"
```

---

### Task 15: RTL CSS Audit + Final Verification

**Files:**
- Modify: throughout (RTL style fixes)

- [ ] **Step 1: Audit and fix RTL-specific CSS issues**

Search for `mr-` and `ml-` patterns across components:
```bash
rg "mr-\d|ml-\d" components/ app/ --include "*.tsx"
```

Replace:
- `mr-*` → `me-*` (margin-inline-end)
- `ml-*` → `ms-*` (margin-inline-start)
- `left-*` / `right-*` positional → `start-*` / `end-*` where applicable
- `-translate-x-*` in sidebar → ensure it works with RTL (the sidebar slides from the right in RTL mode)

- [ ] **Step 2: Run full validation**

```bash
pnpm format
pnpm type-check
pnpm lint
pnpm build
```

All should pass with no errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: RTL CSS adjustments and final localization cleanup"
```

---

### Summary: Order of Tasks

| Task | Description | Depends On |
|------|-------------|-----------|
| 1 | Dictionary files (en.ts + he.ts + index.ts) | — |
| 2 | Database + Session + API | 1 |
| 3 | LocaleProvider + useLocale hook | 1 |
| 4 | LocaleToggle in user menu | 3 |
| 5 | Shared Header | 3 |
| 6 | Home Page Content | 3 |
| 7 | Task Form | 3 |
| 8 | Sidebar components | 3 |
| 9 | Auth components | 3 |
| 10 | Task Details + Chat | 3 |
| 11 | Settings page | 2 |
| 12 | Repo components | 3 |
| 13 | Dialog components | 3 |
| 14 | Remaining components | 3 |
| 15 | RTL audit + final verification | all |
