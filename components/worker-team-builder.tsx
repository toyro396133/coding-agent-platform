'use client'

import {
  ArrowUpDown,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Download,
  Eye,
  EyeOff,
  MessageSquare,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  Variable,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AGENT_MODELS, DEFAULT_MODELS } from '@/lib/ai/model-definitions'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────

export interface WorkerConfig {
  id: string
  role: string
  agentType: string
  model: string
  instructions: string
  priority: number
}

export interface WorkerTeamConfig {
  workers: WorkerConfig[]
  timeoutMinutes: number
}

/** A saved preset stored in localStorage */
interface SavedPreset {
  id: string
  name: string
  config: WorkerConfig[]
  createdAt: number
  updatedAt: number
}

// ─── Constants ──────────────────────────────────────────────────────────

const CODING_AGENTS: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'claude', label: 'Claude', icon: Claude },
  { value: 'codex', label: 'Codex', icon: Codex },
  { value: 'copilot', label: 'Copilot', icon: Copilot },
  { value: 'cursor', label: 'Cursor', icon: Cursor },
  { value: 'gemini', label: 'Gemini', icon: Gemini },
  { value: 'opencode', label: 'opencode', icon: OpenCode },
]

const ROLE_SUGGESTIONS = [
  'Frontend Specialist',
  'Backend Architect',
  'API Designer',
  'Database Engineer',
  'Test Engineer',
  'UI/UX Developer',
  'DevOps Engineer',
  'Security Reviewer',
  'Documentation Writer',
  'Code Reviewer',
]

const INSTRUCTION_TEMPLATES: Record<string, string> = {
  frontend:
    'Focus on implementing the frontend components and UI. Use React/Next.js patterns. Ensure responsive design and proper styling with Tailwind CSS.',
  backend:
    'Focus on the backend API routes, database schemas, and server logic. Ensure proper error handling, validation, and security.',
  testing:
    'Write comprehensive tests for all new and modified code. Include unit tests, integration tests, and ensure coverage is above 80%. Cover edge cases.',
  review:
    'Review all code changes for bugs, security issues, and adherence to best practices. Provide detailed feedback on any issues found.',
  docs: 'Write documentation for all new APIs, components, and configuration changes. Include JSDoc comments and update the README if needed.',
  database:
    'Design and implement database schemas, migrations, and queries. Ensure proper indexing and performance optimization.',
}

/** Available template variables that can be inserted into instructions */
const TEMPLATE_VARIABLES = [
  {
    key: 'repoUrl',
    label: 'Repository URL',
    example: 'https://github.com/user/repo.git',
    description: 'The repository URL',
  },
  {
    key: 'prompt',
    label: 'User Prompt',
    example: 'Add login page',
    description: 'The original user prompt/task description',
  },
  {
    key: 'branchName',
    label: 'Branch Name',
    example: 'feature/login-page',
    description: 'The git branch being worked on',
  },
  { key: 'taskId', label: 'Task ID', example: 'abc123xyz', description: 'The unique task identifier' },
  {
    key: 'repoName',
    label: 'Repo Name',
    example: 'my-project',
    description: 'The repository name (extracted from URL)',
  },
  { key: 'timestamp', label: 'Timestamp', example: '2026-07-30T12:00:00Z', description: 'Current ISO timestamp' },
] as const

const PRESETS_STORAGE_KEY = 'worker-team-presets'

// ─── Helpers ────────────────────────────────────────────────────────────

let workerIdCounter = 0

function createDefaultWorker(agentType?: string): WorkerConfig {
  workerIdCounter++
  const agent = agentType || 'claude'
  return {
    id: `worker-${workerIdCounter}-${Date.now()}`,
    role: '',
    agentType: agent,
    model: DEFAULT_MODELS[agent as keyof typeof DEFAULT_MODELS] || 'claude-sonnet-4-5',
    instructions: '',
    priority: 5,
  }
}

/** Highlight template variables like {{var}} by wrapping them in <mark> tags */
function highlightTemplateVars(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, '<mark class="bg-primary/20 text-primary font-medium rounded px-0.5">$&</mark>')
}

/** Resolve template variables with sample values for preview */
function resolveTemplatePreview(text: string): string {
  return text
    .replace(/\{\{repoUrl\}\}/g, 'https://github.com/user/repo.git')
    .replace(/\{\{prompt\}\}/g, 'Implement login page with email/password auth')
    .replace(/\{\{branchName\}\}/g, 'feature/login-page')
    .replace(/\{\{taskId\}\}/g, 'abc123xyz')
    .replace(/\{\{repoName\}\}/g, 'my-project')
    .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
}

/** Load saved presets from localStorage */
function loadSavedPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedPreset[]
  } catch {
    return []
  }
}

/** Save presets to localStorage */
function savePresets(presets: SavedPreset[]) {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // localStorage might be full
  }
}

/** Expand natural language instruction into structured instructions */
function expandNaturalLanguage(nl: string): string {
  const lower = nl.toLowerCase()

  // Always include the user's original input as the primary instruction
  const sections: string[] = ['## Context', nl.trim()]

  // Detect focus areas from keywords and add targeted guidelines
  const guidelines: string[] = []

  if (
    lower.includes('test') ||
    lower.includes('coverage') ||
    lower.includes('spec') ||
    lower.includes('jest') ||
    lower.includes('cypress')
  ) {
    guidelines.push('- Write or update tests covering the changes. Aim for >80% coverage.')
  }
  if (lower.includes('doc') || lower.includes('comment') || lower.includes('readme') || lower.includes('api doc')) {
    guidelines.push('- Document all new and changed code. Update README if applicable.')
  }
  if (
    lower.includes('security') ||
    lower.includes('auth') ||
    lower.includes('permission') ||
    lower.includes('oauth') ||
    lower.includes('jwt')
  ) {
    guidelines.push('- Ensure proper authentication, authorization, and input validation.')
  }
  if (
    lower.includes('performance') ||
    lower.includes('fast') ||
    lower.includes('speed') ||
    lower.includes('optimize') ||
    lower.includes('cache') ||
    lower.includes('lazy')
  ) {
    guidelines.push('- Optimize for performance. Consider caching, lazy loading, and efficient queries.')
  }
  if (
    lower.includes('api') ||
    lower.includes('endpoint') ||
    lower.includes('route') ||
    lower.includes('rest') ||
    lower.includes('graphql')
  ) {
    guidelines.push('- Design clean API endpoints with proper error handling, validation, and documentation.')
  }
  if (
    lower.includes('ui') ||
    lower.includes('design') ||
    lower.includes('css') ||
    lower.includes('responsive') ||
    lower.includes('style') ||
    lower.includes('tailwind') ||
    lower.includes('frontend')
  ) {
    guidelines.push("- Create a polished, responsive UI following the project's existing design patterns.")
  }
  if (
    lower.includes('database') ||
    lower.includes('schema') ||
    lower.includes('migration') ||
    lower.includes('db') ||
    lower.includes('sql') ||
    lower.includes('postgres')
  ) {
    guidelines.push('- Design database schemas and migrations. Ensure proper indexing and query optimization.')
  }
  if (
    lower.includes('refactor') ||
    lower.includes('clean') ||
    lower.includes('restructure') ||
    lower.includes('simplify')
  ) {
    guidelines.push('- Refactor for clarity and maintainability. Extract reusable functions/components.')
  }
  if (
    lower.includes('error') ||
    lower.includes('bug') ||
    lower.includes('fix') ||
    lower.includes('crash') ||
    lower.includes('broken')
  ) {
    guidelines.push('- Identify and fix bugs. Add error boundaries and graceful error handling.')
  }

  // Always add general guidelines
  sections.push('## Guidelines')
  sections.push('- Follow existing project conventions and code style')
  sections.push('- Write clean, well-documented code with proper TypeScript types')
  sections.push('- Handle edge cases and errors gracefully')
  sections.push('- Use template variables {{repoUrl}} and {{prompt}} for dynamic context')
  if (guidelines.length > 0) {
    sections.push(...guidelines)
  }

  return sections.join('\n\n')
}

// ─── Syntax Highlighted Instructions Editor ─────────────────────────────

interface InstructionsEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Show insert variable toolbar */
  showVariableToolbar?: boolean
}

function InstructionsEditor({
  value,
  onChange,
  placeholder = 'Custom instructions for this worker agent...',
  showVariableToolbar = true,
}: InstructionsEditorProps) {
  const [showPreviewPane, setShowPreviewPane] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  // Insert a template variable at cursor position
  const insertVariable = useCallback(
    (varKey: string) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const varText = `{{${varKey}}}`
      const newValue = value.substring(0, start) + varText + value.substring(end)

      onChange(newValue)

      // Restore cursor position after the inserted variable
      requestAnimationFrame(() => {
        textarea.focus()
        const newCursorPos = start + varText.length
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      })
    },
    [value, onChange],
  )

  // The highlighted version for the overlay
  const highlightedHtml = useMemo(() => {
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return highlightTemplateVars(escaped).replace(/\n/g, '<br />').replace(/ /g, '&nbsp;')
  }, [value])

  const resolvedPreview = useMemo(() => resolveTemplatePreview(value), [value])

  return (
    <div className="space-y-2">
      {/* Toolbar with variable insertion */}
      {showVariableToolbar && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium me-1 shrink-0">
            <Variable className="h-3 w-3 inline me-0.5" />
            Variables:
          </span>
          {TEMPLATE_VARIABLES.map((v) => (
            <TooltipProvider key={v.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
                  >
                    {'{{'}
                    {v.key}
                    {'}}'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  <p>
                    <strong>{v.label}</strong> — {v.description}
                  </p>
                  <p className="text-muted-foreground text-[10px] mt-0.5">e.g. {v.example}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}

          <div className="flex-1" />

          {/* Preview toggle */}
          {value && (
            <button
              type="button"
              onClick={() => setShowPreviewPane(!showPreviewPane)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1',
                showPreviewPane
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              {showPreviewPane ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
              Preview
            </button>
          )}
        </div>
      )}

      {/* Editor with syntax highlighting overlay */}
      <div className="relative">
        {/* Highlight overlay */}
        {value && (
          <div
            ref={highlightRef}
            className="absolute inset-0 pointer-events-none overflow-hidden rounded-md border border-transparent"
            aria-hidden="true"
          >
            <div
              className="p-2 font-mono text-sm whitespace-pre-wrap break-all leading-[1.25rem]"
              dangerouslySetInnerHTML={{ __html: `${highlightedHtml}\n` }}
              style={{
                backgroundColor: 'transparent',
                color: 'transparent',
                minHeight: '100%',
              }}
            />
          </div>
        )}
        {/* Actual textarea — transparent text but visible caret */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder={placeholder}
          rows={3}
          className={cn(
            'text-sm resize-none relative z-10',
            value ? 'text-transparent caret-foreground [&::selection]:bg-primary/30' : '',
          )}
          style={{
            background: 'transparent',
          }}
        />
        {/* Background layer for the textarea area (behind the transparent text) */}
        {value && (
          <div className="absolute inset-0 rounded-md border border-input bg-background -z-10" aria-hidden="true" />
        )}
      </div>

      {/* Resolved preview */}
      {showPreviewPane && value && (
        <div className="rounded-md bg-accent/30 border border-border/50 p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Resolved Preview (with sample values)</span>
          </div>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {resolvedPreview}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Natural Language Input ────────────────────────────────────────────

interface NaturalLanguageInputProps {
  onGenerate: (instructions: string) => void
}

function NaturalLanguageInput({ onGenerate }: NaturalLanguageInputProps) {
  const [nlInput, setNlInput] = useState('')
  const [showInput, setShowInput] = useState(false)

  const handleGenerate = useCallback(() => {
    if (!nlInput.trim()) return
    const expanded = expandNaturalLanguage(nlInput.trim())
    onGenerate(expanded)
    setNlInput('')
    setShowInput(false)
    toast.success('Instructions generated from natural language')
  }, [nlInput, onGenerate])

  // Quick NLP suggestion chips
  const suggestions = [
    {
      label: 'API + Tests',
      value: 'Implement the API endpoints and write tests covering all edge cases. Document the API with examples.',
    },
    {
      label: 'UI + Responsive',
      value:
        'Build responsive UI components with Tailwind CSS. Ensure mobile-first design and proper accessibility (a11y).',
    },
    {
      label: 'Database + Migrations',
      value: 'Design database schema, create migrations, optimize queries with proper indexing. Include seed data.',
    },
  ]

  if (!showInput) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              const expanded = expandNaturalLanguage(s.value)
              onGenerate(expanded)
              toast.success('Instructions generated')
            }}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Sparkles className="h-2.5 w-2.5" />
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 hover:bg-accent transition-colors text-muted-foreground flex items-center gap-1"
        >
          <MessageSquare className="h-2.5 w-2.5" />
          Write in natural language...
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3 w-3 text-amber-500" />
        <span className="text-[10px] font-medium text-muted-foreground">
          Describe what this worker should do in natural language:
        </span>
      </div>
      <Textarea
        value={nlInput}
        onChange={(e) => setNlInput(e.target.value)}
        placeholder="e.g. Build the login page UI and API endpoints, write tests, and add documentation..."
        rows={2}
        className="text-sm resize-none"
      />
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handleGenerate}
          disabled={!nlInput.trim()}
        >
          <Wand2 className="h-3 w-3" />
          Generate Instructions
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setShowInput(false)
            setNlInput('')
          }}
        >
          Cancel
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        The system will expand your description into structured instructions with sections for task, testing,
        documentation, and guidelines.
      </p>
    </div>
  )
}

// ─── Custom Presets Manager ────────────────────────────────────────────

interface PresetManagerProps {
  currentWorkers: WorkerConfig[]
  onLoadPreset: (workers: WorkerConfig[]) => void
}

function PresetManager({ currentWorkers, onLoadPreset }: PresetManagerProps) {
  const [presets, setPresets] = useState<SavedPreset[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  // Load presets on mount and when dialog opens
  useEffect(() => {
    setPresets(loadSavedPresets())
  }, [])

  const handleSave = useCallback(() => {
    if (!presetName.trim()) return
    const existing: SavedPreset[] = loadSavedPresets()
    const now = Date.now()
    const existingIndex = existing.findIndex((p) => p.name === presetName.trim())

    const newPreset: SavedPreset = {
      id: existingIndex >= 0 ? existing[existingIndex].id : `preset-${now}`,
      name: presetName.trim(),
      config: currentWorkers,
      createdAt: existingIndex >= 0 ? existing[existingIndex].createdAt : now,
      updatedAt: now,
    }

    if (existingIndex >= 0) {
      existing[existingIndex] = newPreset
    } else {
      existing.push(newPreset)
    }

    savePresets(existing)
    setPresets(existing)
    setPresetName('')
    setShowSaveDialog(false)
    toast.success(`Preset "${newPreset.name}" saved`)
  }, [presetName, currentWorkers])

  const handleDelete = useCallback(
    (presetId: string) => {
      const updated = presets.filter((p) => p.id !== presetId)
      savePresets(updated)
      setPresets(updated)
      toast.success('Preset deleted')
    },
    [presets],
  )

  const handleLoad = useCallback(
    (preset: SavedPreset) => {
      onLoadPreset(preset.config)
      setShowPresets(false)
      toast.success(`Preset "${preset.name}" loaded`)
    },
    [onLoadPreset],
  )

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1',
            showPresets
              ? 'bg-accent text-foreground'
              : 'bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground',
          )}
        >
          <Bookmark className="h-2.5 w-2.5" />
          My Presets ({presets.length})
        </button>

        {currentWorkers.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPresetName('')
              setShowSaveDialog(true)
            }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Save className="h-2.5 w-2.5" />
            Save current
          </button>
        )}
      </div>

      {/* Presets dropdown */}
      {showPresets && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-background p-2">
          {presets.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              No saved presets yet. Configure a worker team and save it.
            </p>
          ) : (
            presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors group"
              >
                <Bookmark className="h-3 w-3 text-muted-foreground shrink-0" />
                <button
                  type="button"
                  onClick={() => handleLoad(preset)}
                  className="flex-1 text-xs text-left truncate hover:text-foreground"
                >
                  <span className="font-medium">{preset.name}</span>
                  <span className="text-[10px] text-muted-foreground ms-1.5">
                    ({preset.config.length} worker{preset.config.length > 1 ? 's' : ''})
                  </span>
                </button>
                <span className="text-[10px] text-muted-foreground/50">
                  {new Date(preset.updatedAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(preset.id)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="mt-2 p-2 rounded-lg border border-border/50 bg-background space-y-2">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name (e.g. 'My Web App Team')"
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') setShowSaveDialog(false)
            }}
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={!presetName.trim()}
            >
              <Download className="h-3 w-3 me-1" />
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowSaveDialog(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────

interface WorkerTeamBuilderProps {
  value: WorkerTeamConfig
  onChange: (config: WorkerTeamConfig) => void
  maxWorkers?: number
}

export function WorkerTeamBuilder({ value, onChange, maxWorkers = 8 }: WorkerTeamBuilderProps) {
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null)
  const [_showInstructionsPreview, _setShowInstructionsPreview] = useState(false)
  const [activeInstructionsTab, setActiveInstructionsTab] = useState<'edit' | 'nl'>('edit')

  const updateWorker = useCallback(
    (workerId: string, updates: Partial<WorkerConfig>) => {
      const newWorkers = value.workers.map((w) => (w.id === workerId ? { ...w, ...updates } : w))
      onChange({ ...value, workers: newWorkers })
    },
    [value, onChange],
  )

  const removeWorker = useCallback(
    (workerId: string) => {
      const newWorkers = value.workers.filter((w) => w.id !== workerId)
      onChange({ ...value, workers: newWorkers })
      if (expandedWorker === workerId) {
        setExpandedWorker(newWorkers.length > 0 ? newWorkers[newWorkers.length - 1].id : null)
      }
    },
    [value, onChange, expandedWorker],
  )

  const addWorker = useCallback(
    (agentType?: string) => {
      if (value.workers.length >= maxWorkers) return
      const worker = createDefaultWorker(agentType)
      const newWorkers = [...value.workers, worker]
      onChange({ ...value, workers: newWorkers })
      setExpandedWorker(worker.id)
    },
    [value, onChange, maxWorkers],
  )

  const _reorderWorkers = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= value.workers.length) return
      const newWorkers = [...value.workers]
      const [moved] = newWorkers.splice(fromIndex, 1)
      newWorkers.splice(toIndex, 0, moved)
      onChange({ ...value, workers: newWorkers })
    },
    [value, onChange],
  )

  const loadPreset = useCallback(
    (workers: WorkerConfig[]) => {
      onChange({ ...value, workers })
      if (workers.length > 0) setExpandedWorker(workers[workers.length - 1].id)
    },
    [value, onChange],
  )

  const setPresetTeam = useCallback(
    (preset: string) => {
      let workers: WorkerConfig[]
      switch (preset) {
        case 'frontend-backend':
          workers = [
            {
              ...createDefaultWorker('claude'),
              role: 'Frontend Specialist',
              instructions: INSTRUCTION_TEMPLATES.frontend,
              priority: 5,
            },
            {
              ...createDefaultWorker('codex'),
              role: 'Backend Architect',
              instructions: INSTRUCTION_TEMPLATES.backend,
              priority: 5,
            },
          ]
          break
        case 'full-stack-test':
          workers = [
            {
              ...createDefaultWorker('claude'),
              role: 'Frontend Specialist',
              instructions: INSTRUCTION_TEMPLATES.frontend,
              priority: 5,
            },
            {
              ...createDefaultWorker('gemini'),
              role: 'Backend Architect',
              instructions: INSTRUCTION_TEMPLATES.backend,
              priority: 5,
            },
            {
              ...createDefaultWorker('cursor'),
              role: 'Test Engineer',
              instructions: INSTRUCTION_TEMPLATES.testing,
              priority: 3,
            },
          ]
          break
        case 'code-review':
          workers = [
            {
              ...createDefaultWorker('claude'),
              role: 'Primary Developer',
              instructions: 'Implement the full feature described in the prompt.',
              priority: 5,
            },
            {
              ...createDefaultWorker('opencode'),
              role: 'Code Reviewer',
              instructions: INSTRUCTION_TEMPLATES.review,
              priority: 2,
            },
          ]
          break
        default:
          workers = [createDefaultWorker('claude')]
      }
      onChange({ ...value, workers })
      if (workers.length > 0) setExpandedWorker(workers[workers.length - 1].id)
    },
    [value, onChange],
  )

  return (
    <div className="space-y-3">
      {/* Preset teams + Custom presets */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Built-in Presets:</span>
          <button
            type="button"
            onClick={() => setPresetTeam('frontend-backend')}
            className="text-xs px-2 py-1 rounded-md bg-accent/50 hover:bg-accent transition-colors"
          >
            Frontend + Backend
          </button>
          <button
            type="button"
            onClick={() => setPresetTeam('full-stack-test')}
            className="text-xs px-2 py-1 rounded-md bg-accent/50 hover:bg-accent transition-colors"
          >
            Full Stack + Test
          </button>
          <button
            type="button"
            onClick={() => setPresetTeam('code-review')}
            className="text-xs px-2 py-1 rounded-md bg-accent/50 hover:bg-accent transition-colors"
          >
            Dev + Reviewer
          </button>
        </div>

        {/* Custom presets */}
        <PresetManager currentWorkers={value.workers} onLoadPreset={loadPreset} />
      </div>

      {/* Worker list */}
      {value.workers.length > 0 && (
        <div className="space-y-2">
          {value.workers.map((worker, _index) => {
            const agentMeta = CODING_AGENTS.find((a) => a.value === worker.agentType)
            const AgentIcon = agentMeta?.icon
            const isExpanded = expandedWorker === worker.id
            const hasInstructions = worker.instructions.trim().length > 0
            const isConfigured = worker.role.trim().length > 0

            return (
              <Card
                key={worker.id}
                className={cn(
                  'transition-all duration-200',
                  isExpanded ? 'shadow-sm border-primary/20' : 'shadow-none',
                )}
              >
                <CardContent className="p-0">
                  {/* Header row — always visible */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: expand/collapse toggle */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                    onClick={() => setExpandedWorker(isExpanded ? null : worker.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />

                    {AgentIcon && <AgentIcon className="h-4 w-4 shrink-0" />}

                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {isConfigured ? worker.role : agentMeta?.label || worker.agentType}
                      </span>
                      {!isConfigured && (
                        <span className="text-xs text-muted-foreground">{agentMeta?.label} — needs role</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasInstructions && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>Instructions configured</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        #{worker.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {worker.agentType}
                      </Badge>
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeWorker(worker.id)
                      }}
                      className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Expanded settings */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/50">
                      {/* Role name */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Role name</Label>
                        <Input
                          value={worker.role}
                          onChange={(e) => updateWorker(worker.id, { role: e.target.value })}
                          placeholder="e.g. Frontend Specialist"
                          className="h-8 text-sm"
                        />
                        {!worker.role && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {ROLE_SUGGESTIONS.slice(0, 4).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => updateWorker(worker.id, { role: s })}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 hover:bg-accent transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Agent</Label>
                          <Select
                            value={worker.agentType}
                            onValueChange={(value) => {
                              updateWorker(worker.id, {
                                agentType: value,
                                model: DEFAULT_MODELS[value as keyof typeof DEFAULT_MODELS] || 'claude-sonnet-4-5',
                              })
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CODING_AGENTS.map((agent) => (
                                <SelectItem key={agent.value} value={agent.value}>
                                  <div className="flex items-center gap-2">
                                    <agent.icon className="h-3.5 w-3.5" />
                                    <span>{agent.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Model</Label>
                          <Select
                            value={worker.model}
                            onValueChange={(value) => updateWorker(worker.id, { model: value })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(AGENT_MODELS[worker.agentType as keyof typeof AGENT_MODELS] || []).map((model) => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Instructions with Syntax Highlighting + Template Variables + NL Input */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Instructions for this worker
                          </Label>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setActiveInstructionsTab('edit')}
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                                activeInstructionsTab === 'edit'
                                  ? 'bg-accent text-foreground'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                              )}
                            >
                              <Code className="h-2.5 w-2.5 inline me-0.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveInstructionsTab('nl')}
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                                activeInstructionsTab === 'nl'
                                  ? 'bg-accent text-foreground'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                              )}
                            >
                              <Sparkles className="h-2.5 w-2.5 inline me-0.5" />
                              NL
                            </button>
                          </div>
                        </div>

                        {activeInstructionsTab === 'edit' ? (
                          <>
                            <InstructionsEditor
                              value={worker.instructions}
                              onChange={(value) => updateWorker(worker.id, { instructions: value })}
                              placeholder="Custom instructions for this worker agent. Use {{variable}} for dynamic values."
                              showVariableToolbar
                            />
                            {/* Template buttons shown when instructions are empty */}
                            {!worker.instructions && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {Object.entries(INSTRUCTION_TEMPLATES).map(([key, template]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => updateWorker(worker.id, { instructions: template })}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 hover:bg-accent transition-colors capitalize"
                                  >
                                    {key}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <NaturalLanguageInput
                            onGenerate={(instructions) => {
                              updateWorker(worker.id, { instructions })
                              setActiveInstructionsTab('edit')
                            }}
                          />
                        )}
                      </div>

                      {/* Priority */}
                      <div className="flex items-center gap-3">
                        <div className="space-y-1 flex-1">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Priority <span className="text-muted-foreground/50">(higher = wins conflicts)</span>
                          </Label>
                          <div className="flex items-center gap-2">
                            {[1, 3, 5, 7, 10].map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => updateWorker(worker.id, { priority: p })}
                                className={cn(
                                  'text-xs px-2 py-1 rounded transition-colors',
                                  worker.priority === p
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-accent/50 hover:bg-accent',
                                )}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add worker button */}
      <div className="flex items-center gap-2">
        {value.workers.length < maxWorkers ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => addWorker()}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Worker
            </Button>
            {CODING_AGENTS.slice(0, 4).map((agent) => (
              <button
                key={agent.value}
                type="button"
                onClick={() => addWorker(agent.value)}
                className="p-1.5 rounded-md hover:bg-accent transition-colors"
                title={`Add ${agent.label}`}
              >
                <agent.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Maximum of {maxWorkers} workers reached</p>
        )}
      </div>

      {/* Team summary */}
      {value.workers.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/50">
          <Users className="h-3.5 w-3.5" />
          <span>
            {value.workers.length} worker{value.workers.length > 1 ? 's' : ''} —
            {value.workers.map((w) => w.agentType).join(', ')}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <Variable className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/50">
            Use <code className="text-primary/70 bg-primary/10 px-0.5 rounded text-[9px]">{'{{prompt}}'}</code>,{' '}
            <code className="text-primary/70 bg-primary/10 px-0.5 rounded text-[9px]">{'{{repoUrl}}'}</code> in
            instructions
          </span>
        </div>
      )}
    </div>
  )
}
