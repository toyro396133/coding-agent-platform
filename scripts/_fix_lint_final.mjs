// Temporary lint-fix helper — run from the chore/fix-lint-debt worktree.
// Usage: cd /tmp/main-wt && node C:/coding-agent-platform/scripts/_fix_lint_final.mjs
import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const CRLF = /\r\n/

function apply(file, replacements) {
  const abs = path.resolve(cwd, file)
  if (!fs.existsSync(abs)) {
    console.log('MISSING', file)
    return
  }
  const content = fs.readFileSync(abs, 'utf8')
  const isCRLF = CRLF.test(content)
  let src = content.replace(/\r\n/g, '\n')

  for (const [from, to] of replacements) {
    const count = src.split(from).length - 1
    if (count === 0) {
      console.log(`  ✗ NO MATCH in ${file}: ${from.split('\n')[0].slice(0, 60)}...`)
      continue
    }
    if (count > 1) {
      console.log(`  ✗ MULTIPLE (${count}) in ${file}: ${from.split('\n')[0].slice(0, 60)}...`)
      continue
    }
    src = src.replace(from, to)
    console.log(`  ✓ ${file}: ${from.split('\n')[0].slice(0, 50)}...`)
  }

  const out = isCRLF ? src.replace(/\n/g, '\r\n') : src
  fs.writeFileSync(abs, out)
}

// ─── components/logos/codex.tsx + copilot.tsx (noSvgWithoutTitle) ───────────
apply('components/logos/codex.tsx', [
  [
    `    {...props}
  >
    <path`,
    `    {...props}
  >
    <title>Codex</title>
    <path`,
  ],
])
apply('components/logos/copilot.tsx', [
  [
    `    {...props}
  >
    <path d="M23.922`,
    `    {...props}
  >
    <title>Copilot</title>
    <path d="M23.922`,
  ],
])

// ─── components/app-layout.tsx ──────────────────────────────────────────────
apply('components/app-layout.tsx', [
  // Remove duplicate plain fetchTasks (keep the useCallback one declared above the effects)
  [
    `  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks')
      if (response.ok) {
        const data = await response.json()
        setTasks(data.tasks)
      } else if (response.status === 401) {
        // User is not authenticated, show empty tasks
        setTasks([])
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setIsLoading(false)
    }
  }

`,
    ``,
  ],
  // Backdrop: role="button" div → real button (button handles Enter/Space natively)
  [
    `            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              role="button"
              tabIndex={-1}
              aria-label="Close sidebar"
              onClick={closeSidebar}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') closeSidebar()
              }}
            />`,
    `            <button
              type="button"
              tabIndex={-1}
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              aria-label="Close sidebar"
              onClick={closeSidebar}
            />`,
  ],
  // Resize handle: add aria-valuenow/min/max (fixes useAriaPropsForRole)
  [
    `          {/* Resize Handle - Desktop Only, when sidebar is open */}
          <div
            className={\`
            hidden lg:block fixed inset-y-0 cursor-col-resize group z-50 hover:bg-primary/20
            \${isResizing || !hasMounted ? '' : 'transition-all duration-300 ease-in-out'}
            \${isSidebarOpen ? 'w-1 opacity-100' : 'w-0 opacity-0'}
          \`}
            onMouseDown={isSidebarOpen ? handleMouseDown : undefined}
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}`,
    `          {/* Resize Handle - Desktop Only, when sidebar is open */}
          {/* biome-ignore lint/a11y/useSemanticElements: keyboard-operable splitter widget, not a static hr */}
          <div
            className={\`
            hidden lg:block fixed inset-y-0 cursor-col-resize group z-50 hover:bg-primary/20
            \${isResizing || !hasMounted ? '' : 'transition-all duration-300 ease-in-out'}
            \${isSidebarOpen ? 'w-1 opacity-100' : 'w-0 opacity-0'}
          \`}
            onMouseDown={isSidebarOpen ? handleMouseDown : undefined}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={200}
            aria-valuemax={600}
            tabIndex={0}`,
  ],
])

// ─── components/plugin-manager.tsx (noRedeclare) ────────────────────────────
apply('components/plugin-manager.tsx', [
  [
    `  const fetchPlugins = async () => {
    try {
      const res = await fetch('/api/plugins')
      if (!res.ok) {
        console.error('Plugin fetch failed')
        return
      }
      const data = await res.json()
      setPlugins(data.plugins || [])
    } catch (_e) {
      console.error('Plugin fetch failed')
    } finally {
      setLoading(false)
    }
  }

`,
    ``,
  ],
])

// ─── components/worker-log-tabs.tsx (hook order + use-before-declaration) ───
apply('components/worker-log-tabs.tsx', [
  // Insert getWorkerLogs above the useEffect that uses it
  [
    `  // Combine external data with live polled data
  const mergedStatusData = liveWorkerStatus || workerStatusData

  useEffect(() => {`,
    `  // Combine external data with live polled data
  const mergedStatusData = liveWorkerStatus || workerStatusData

  const getWorkerLogs = useCallback(
    (workerName: string): LogEntry[] => {
      // First try polled data for live logs
      if (mergedStatusData?.workerLogs) {
        const polledLogs = mergedStatusData.workerLogs[workerName]
        if (polledLogs && polledLogs.length > 0) {
          return polledLogs as LogEntry[]
        }
      }
      // Fall back to task.logs from props
      return (task.logs || []).filter((log) => {
        const workerNameFromLog = extractWorkerName(log.message)
        return workerNameFromLog === workerName
      })
    },
    [mergedStatusData, task.logs],
  )

  useEffect(() => {`,
  ],
  // Remove the original getWorkerLogs definition (now declared above)
  [
    `  const getWorkerLogs = useCallback(
    (workerName: string): LogEntry[] => {
      // First try polled data for live logs
      if (mergedStatusData?.workerLogs) {
        const polledLogs = mergedStatusData.workerLogs[workerName]
        if (polledLogs && polledLogs.length > 0) {
          return polledLogs as LogEntry[]
        }
      }
      // Fall back to task.logs from props
      return (task.logs || []).filter((log) => {
        const workerNameFromLog = extractWorkerName(log.message)
        return workerNameFromLog === workerName
      })
    },
    [mergedStatusData, task.logs],
  )

`,
    ``,
  ],
])

// ─── components/task-details.tsx ────────────────────────────────────────────
apply('components/task-details.tsx', [
  // Reorder: closeTab (useCallback) before attemptCloseTab (useCallback)
  [
    `  const attemptCloseTab = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const currentTabs = openTabsByMode[viewMode]
    const fileToClose = currentTabs[index]

    // Check if the tab has unsaved changes
    if (tabsWithUnsavedChanges.has(fileToClose)) {
      setTabToClose(index)
      setShowCloseTabDialog(true)
    } else {
      closeTab(index)
    }
  }

  const closeTab = (index: number) => {
    const currentTabs = openTabsByMode[viewMode]
    const currentActiveIndex = activeTabIndexByMode[viewMode]
    const fileToClose = currentTabs[index]
    const newTabs = currentTabs.filter((_, i) => i !== index)

    setOpenTabsByMode((prev) => ({ ...prev, [viewMode]: newTabs }))

    // Remove from unsaved changes
    setTabsWithUnsavedChanges((prev) => {
      const newSet = new Set(prev)
      newSet.delete(fileToClose)
      return newSet
    })

    // Adjust active tab index
    if (newTabs.length === 0) {
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: 0 }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: undefined }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    } else if (currentActiveIndex >= newTabs.length) {
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newTabs.length - 1 }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: newTabs[newTabs.length - 1] }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    } else if (currentActiveIndex === index) {
      // If closing the active tab, switch to the previous tab (or next if it's the first)
      const newIndex = Math.max(0, index - 1)
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newIndex }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: newTabs[newIndex] }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    } else if (currentActiveIndex > index) {
      // Adjust index if a tab before the active one was closed
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: currentActiveIndex - 1 }))
    }
  }`,
    `  const closeTab = useCallback(
    (index: number) => {
      const currentTabs = openTabsByMode[viewMode]
      const currentActiveIndex = activeTabIndexByMode[viewMode]
      const fileToClose = currentTabs[index]
      const newTabs = currentTabs.filter((_, i) => i !== index)

      setOpenTabsByMode((prev) => ({ ...prev, [viewMode]: newTabs }))

      // Remove from unsaved changes
      setTabsWithUnsavedChanges((prev) => {
        const newSet = new Set(prev)
        newSet.delete(fileToClose)
        return newSet
      })

      // Adjust active tab index
      if (newTabs.length === 0) {
        setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: 0 }))
        setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: undefined }))
        setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
      } else if (currentActiveIndex >= newTabs.length) {
        setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newTabs.length - 1 }))
        setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: newTabs[newTabs.length - 1] }))
        setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
      } else if (currentActiveIndex === index) {
        // If closing the active tab, switch to the previous tab (or next if it's the first)
        const newIndex = Math.max(0, index - 1)
        setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: newIndex }))
        setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: newTabs[newIndex] }))
        setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
      } else if (currentActiveIndex > index) {
        // Adjust index if a tab before the active one was closed
        setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: currentActiveIndex - 1 }))
      }
    },
    [openTabsByMode, viewMode, activeTabIndexByMode],
  )

  const attemptCloseTab = useCallback(
    (index: number, e?: React.MouseEvent) => {
      e?.stopPropagation()
      const currentTabs = openTabsByMode[viewMode]
      const fileToClose = currentTabs[index]

      // Check if the tab has unsaved changes
      if (tabsWithUnsavedChanges.has(fileToClose)) {
        setTabToClose(index)
        setShowCloseTabDialog(true)
      } else {
        closeTab(index)
      }
    },
    [openTabsByMode, viewMode, tabsWithUnsavedChanges, closeTab],
  )`,
  ],
  // switchToTab → useCallback
  [
    `  const switchToTab = (index: number) => {
    const currentTabs = openTabsByMode[viewMode]
    setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: index }))
    setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: currentTabs[index] }))
    setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
  }`,
    `  const switchToTab = useCallback(
    (index: number) => {
      const currentTabs = openTabsByMode[viewMode]
      setActiveTabIndexByMode((prev) => ({ ...prev, [viewMode]: index }))
      setSelectedFileByMode((prev) => ({ ...prev, [viewMode]: currentTabs[index] }))
      setSelectedItemIsFolderByMode((prev) => ({ ...prev, [viewMode]: false }))
    },
    [openTabsByMode, viewMode],
  )`,
  ],
  // Files splitter: aria-valuenow + biome-ignore useSemanticElements
  [
    `              <div
                className="w-3 cursor-col-resize flex-shrink-0 relative group"
                onMouseDown={() => setResizingPane('files')}
                role="separator"
                aria-orientation="vertical"
                tabIndex={0}`,
    `              {/* biome-ignore lint/a11y/useSemanticElements: keyboard-operable splitter widget, not a static hr */}
              <div
                className="w-3 cursor-col-resize flex-shrink-0 relative group"
                onMouseDown={() => setResizingPane('files')}
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={filesPaneWidth}
                aria-valuemin={150}
                aria-valuemax={500}
                tabIndex={0}`,
  ],
  // Chat splitter: aria-valuenow + biome-ignore useSemanticElements
  [
    `              <div
                className="w-3 cursor-col-resize flex-shrink-0 relative group"
                onMouseDown={() => setResizingPane('chat')}
                role="separator"
                aria-orientation="vertical"
                tabIndex={0}`,
    `              {/* biome-ignore lint/a11y/useSemanticElements: keyboard-operable splitter widget, not a static hr */}
              <div
                className="w-3 cursor-col-resize flex-shrink-0 relative group"
                onMouseDown={() => setResizingPane('chat')}
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={chatPaneWidth}
                aria-valuemin={200}
                aria-valuemax={500}
                tabIndex={0}`,
  ],
  // Close-tab span inside the tab button → biome-ignore useSemanticElements
  [
    `                              <span
                                onClick={(e) => attemptCloseTab(index, e)}`,
    `                              {/* biome-ignore lint/a11y/useSemanticElements: close control nested inside the tab button */}
                              <span
                                onClick={(e) => attemptCloseTab(index, e)}`,
  ],
])

// ─── components/logs-pane.tsx ───────────────────────────────────────────────
apply('components/logs-pane.tsx', [
  // Resize handle: aria-valuenow + biome-ignore
  [
    `        <div
          className={\`absolute top-0 left-0 right-0 h-1 cursor-row-resize group hover:bg-primary/20 \${isResizing ? '' : 'transition-colors'}\`}
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="horizontal"
          tabIndex={0}`,
    `        {/* biome-ignore lint/a11y/useSemanticElements: keyboard-operable splitter widget, not a static hr */}
        <div
          className={\`absolute top-0 left-0 right-0 h-1 cursor-row-resize group hover:bg-primary/20 \${isResizing ? '' : 'transition-colors'}\`}
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={paneHeight}
          aria-valuemin={100}
          aria-valuemax={600}
          tabIndex={0}`,
  ],
  // Header toggle (contains nested tab buttons + Select) → biome-ignore
  [
    `        <div
          className="border-b flex items-center justify-between flex-shrink-0 hover:bg-accent/50 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Toggle logs panel"`,
    `        {/* biome-ignore lint/a11y/useSemanticElements: header toggles collapse and contains nested controls (tabs/select) */}
        <div
          className="border-b flex items-center justify-between flex-shrink-0 hover:bg-accent/50 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Toggle logs panel"`,
  ],
  // stopPropagation wrappers (logs) → biome-ignore noStaticElementInteractions
  [
    `            <div className="flex items-center gap-1.5 mr-3" onClick={(e) => e.stopPropagation()} role="presentation">`,
    `            {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper around controls inside the clickable header */}
            <div className="flex items-center gap-1.5 mr-3" onClick={(e) => e.stopPropagation()} role="presentation">`,
  ],
  // stopPropagation wrappers (terminal)
  [
    `            <div className="flex items-center gap-1 mr-3" onClick={(e) => e.stopPropagation()} role="presentation">`,
    `            {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper around controls inside the clickable header */}
            <div className="flex items-center gap-1 mr-3" onClick={(e) => e.stopPropagation()} role="presentation">`,
  ],
])

// ─── components/file-browser.tsx ────────────────────────────────────────────
apply('components/file-browser.tsx', [
  // folderElement: add key + biome-ignore useSemanticElements
  [
    `        const folderElement = (
          <div
            draggable={isDragEnabled}
            onDragStart={(e) => handleDragStart(e, fullPath, 'folder')}`,
    `        const folderElement = (
          {/* biome-ignore lint/a11y/useSemanticElements: draggable tree row with custom keyboard + DnD handlers */}
          <div
            key={fullPath}
            draggable={isDragEnabled}
            onDragStart={(e) => handleDragStart(e, fullPath, 'folder')}`,
  ],
  // fileElement: add key + biome-ignore useSemanticElements
  [
    `        const fileElement = (
          <div
            draggable={isDragEnabled}
            onDragStart={(e) => handleDragStart(e, node.filename!, 'file')}`,
    `        const fileElement = (
          {/* biome-ignore lint/a11y/useSemanticElements: draggable tree row with custom keyboard + DnD handlers */}
          <div
            key={node.filename}
            draggable={isDragEnabled}
            onDragStart={(e) => handleDragStart(e, node.filename!, 'file')}`,
  ],
])

// ─── components/landing-page.tsx ────────────────────────────────────────────
apply('components/landing-page.tsx', [
  [
    `            <div
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-5 py-4 cursor-text transition-shadow duration-300 hover:border-amber-500/20"`,
    `            {/* biome-ignore lint/a11y/useSemanticElements: animated typewriter demo box that forwards input to the real prompt field */}
            <div
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-5 py-4 cursor-text transition-shadow duration-300 hover:border-amber-500/20"`,
  ],
])

// ─── components/sandbox-visualizer.tsx ──────────────────────────────────────
apply('components/sandbox-visualizer.tsx', [
  [
    `  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200',`,
    `  return (
    {/* biome-ignore lint/a11y/useSemanticElements: interactive worker row with existing keyboard handling */}
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200',`,
  ],
])

// ─── components/terminal.tsx ────────────────────────────────────────────────
apply('components/terminal.tsx', [
  // Add id to TerminalLine + module-level counter
  [
    `interface TerminalLine {
  type: 'command' | 'output' | 'error'
  content: string
  timestamp: Date
}`,
    `interface TerminalLine {
  id: number
  type: 'command' | 'output' | 'error'
  content: string
  timestamp: Date
}

// Monotonic id generator for stable terminal line keys
let nextTerminalLineId = 0`,
  ],
  // click-to-focus wrapper → biome-ignore useSemanticElements (contains a real input)
  [
    `  return (
    <div
      className={cn('flex flex-col h-full bg-black text-green-400 font-mono text-xs', className)}
      role="button"
      tabIndex={0}`,
    `  return (
    {/* biome-ignore lint/a11y/useSemanticElements: click-to-focus wrapper that contains a real input */}
    <div
      className={cn('flex flex-col h-full bg-black text-green-400 font-mono text-xs', className)}
      role="button"
      tabIndex={0}`,
  ],
  // Command push
  [
    `      {
        type: 'command',
        content: command,
        timestamp: new Date(),
      },`,
    `      {
        id: nextTerminalLineId++,
        type: 'command',
        content: command,
        timestamp: new Date(),
      },`,
  ],
  // stdout push
  [
    `          newLines.push({
            type: 'output',
            content: result.data.stdout,
            timestamp: new Date(),
          })`,
    `          newLines.push({
            id: nextTerminalLineId++,
            type: 'output',
            content: result.data.stdout,
            timestamp: new Date(),
          })`,
  ],
  // stderr push
  [
    `          newLines.push({
            type: 'error',
            content: result.data.stderr,
            timestamp: new Date(),
          })`,
    `          newLines.push({
            id: nextTerminalLineId++,
            type: 'error',
            content: result.data.stderr,
            timestamp: new Date(),
          })`,
  ],
  // Error push (command failure)
  [
    `          {
            type: 'error',
            content: result.error || 'Command execution failed',
            timestamp: new Date(),
          },`,
    `          {
            id: nextTerminalLineId++,
            type: 'error',
            content: result.error || 'Command execution failed',
            timestamp: new Date(),
          },`,
  ],
  // Error push (fetch failure)
  [
    `        {
          type: 'error',
          content: 'Failed to execute command',
          timestamp: new Date(),
        },`,
    `        {
          id: nextTerminalLineId++,
          type: 'error',
          content: 'Failed to execute command',
          timestamp: new Date(),
        },`,
  ],
  // Completion list push
  [
    `            {
              type: 'output',
              content: completionList,
              timestamp: new Date(),
            },`,
    `            {
              id: nextTerminalLineId++,
              type: 'output',
              content: completionList,
              timestamp: new Date(),
            },`,
  ],
  // Key: index → stable id
  [`        {history.map((line, index) => {`, `        {history.map((line) => {`],
  [
    `            <div key={\`\${line.timestamp || 't'}\${index}\`} className={cn('leading-tight', color)}>`,
    `            <div key={line.id} className={cn('leading-tight', color)}>`,
  ],
])

// ─── components/connectors/manage-connectors.tsx + atoms ────────────────────
apply('lib/atoms/connector-dialog.ts', [
  [
    `export const envVarsAtom = atom<Array<{ key: string; value: string }>>([])`,
    `export const envVarsAtom = atom<Array<{ id: string; key: string; value: string }>>([])`,
  ],
])
apply('components/connectors/manage-connectors.tsx', [
  [
    `  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }`,
    `  const addEnvVar = () => {
    setEnvVars([...envVars, { id: crypto.randomUUID(), key: '', value: '' }])
  }`,
  ],
  [
    `                      {envVars.map((envVar, index) => (
                        <div key={\`env-\${index}\`} className="flex gap-2">`,
    `                      {envVars.map((envVar) => (
                        <div key={envVar.id} className="flex gap-2">`,
  ],
])

// ─── test files (noThenProperty: move biome-ignore to its own line) ─────────
const thenLine = `      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled), // biome-ignore lint/suspicious/noThenProperty: thenable mock`
const thenFixed = `      // biome-ignore lint/suspicious/noThenProperty: thenable mock
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),`
apply('lib/ai/orchestrator/capabilities/plan-tools.test.ts', [[thenLine, thenFixed]])
apply('lib/ai/orchestrator/capabilities/system-tools.test.ts', [[thenLine, thenFixed]])

// ─── components/worker-team-builder.tsx (extend existing biome-ignore) ──────
apply('components/worker-team-builder.tsx', [
  [
    `                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: expand/collapse toggle */}`,
    `                  {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/useSemanticElements: expand/collapse header row */}`,
  ],
])

console.log('\nDone.')
