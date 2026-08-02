import {
  BarChart3,
  Blocks,
  Bot,
  Box,
  ClipboardList,
  Clock,
  Cpu,
  Database,
  Eye,
  FileCode2,
  FileText,
  FolderGit2,
  GitBranch,
  GitCompareArrows,
  GitPullRequest,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Merge,
  MessageSquare,
  Network,
  Package,
  Plug,
  Puzzle,
  RefreshCw,
  Repeat,
  Route,
  Ruler,
  ScanEye,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Timer,
  Users,
  Wallet,
  Wand2,
  Workflow,
  Zap,
} from 'lucide-react'

export interface CapabilityFeature {
  id: string
  icon: LucideIcon
}

export interface CapabilityCategory {
  id: string
  icon: LucideIcon
  features: CapabilityFeature[]
}

export interface CapabilityStat {
  value: string
  label: 'statAgents' | 'statModels' | 'statPacks' | 'statCategories'
}

export const CAPABILITY_STATS: CapabilityStat[] = [
  { value: '6', label: 'statAgents' },
  { value: '45+', label: 'statModels' },
  { value: '12', label: 'statPacks' },
  { value: '14', label: 'statCategories' },
]

export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  {
    id: 'agents',
    icon: Bot,
    features: [
      { id: 'sixAgents', icon: Cpu },
      { id: 'compareMode', icon: GitCompareArrows },
      { id: 'perAgentModels', icon: Layers },
      { id: 'byok', icon: KeyRound },
      { id: 'keepAlive', icon: Timer },
    ],
  },
  {
    id: 'router',
    icon: Route,
    features: [
      { id: 'twoPhase', icon: GitCompareArrows },
      { id: 'stackDetection', icon: Ruler },
      { id: 'complexity', icon: Sparkles },
      { id: 'fallback', icon: Repeat },
      { id: 'retry', icon: RefreshCw },
      { id: 'rateLimits', icon: ShieldAlert },
      { id: 'cache', icon: Database },
      { id: 'metrics', icon: BarChart3 },
    ],
  },
  {
    id: 'orchestrator',
    icon: Workflow,
    features: [
      { id: 'stateMachine', icon: Workflow },
      { id: 'capabilityPacks', icon: Package },
      { id: 'planning', icon: ClipboardList },
      { id: 'taskQueue', icon: ListOrdered },
      { id: 'subAgents', icon: Network },
      { id: 'projectRules', icon: FileText },
      { id: 'checkpoints', icon: History },
      { id: 'budget', icon: Wallet },
      { id: 'persistentAgents', icon: Clock },
      { id: 'pluginRegistry', icon: Puzzle },
    ],
  },
  {
    id: 'workers',
    icon: Users,
    features: [
      { id: 'parallelSandboxes', icon: Box },
      { id: 'autoDeploy', icon: Zap },
      { id: 'multiCliRunners', icon: Terminal },
      { id: 'patchMerging', icon: Merge },
      { id: 'builder', icon: Users },
    ],
  },
  {
    id: 'sandbox',
    icon: Box,
    features: [
      { id: 'lifecycle', icon: Box },
      { id: 'pipeline', icon: Layers },
      { id: 'autoFix', icon: Wand2 },
      { id: 'devServer', icon: Terminal },
      { id: 'browser', icon: ScanEye },
      { id: 'pkgManager', icon: Package },
      { id: 'portDetection', icon: Plug },
      { id: 'costEstimator', icon: Wallet },
      { id: 'localExecution', icon: Cpu },
    ],
  },
  {
    id: 'visualQa',
    icon: Eye,
    features: [
      { id: 'browserTools', icon: ScanEye },
      { id: 'critiqueLoop', icon: Eye },
      { id: 'autoVisualQa', icon: Wand2 },
      { id: 'store', icon: Database },
    ],
  },
  {
    id: 'memory',
    icon: Database,
    features: [
      { id: 'embeddings', icon: Database },
      { id: 'saveRetrieve', icon: History },
      { id: 'semanticSearch', icon: Search },
      { id: 'summarization', icon: FileText },
      { id: 'mentions', icon: MessageSquare },
    ],
  },
  {
    id: 'api',
    icon: Plug,
    features: [
      { id: 'openaiCompat', icon: Plug },
      { id: 'streaming', icon: Zap },
      { id: 'keys', icon: KeyRound },
      { id: 'cancel', icon: ShieldAlert },
      { id: 'idempotency', icon: Repeat },
      { id: 'jobs', icon: ClipboardList },
      { id: 'metrics', icon: BarChart3 },
    ],
  },
  {
    id: 'git',
    icon: GitBranch,
    features: [
      { id: 'branchNames', icon: GitBranch },
      { id: 'commitMessages', icon: MessageSquare },
      { id: 'prs', icon: GitPullRequest },
      { id: 'conflictResolution', icon: Merge },
      { id: 'repoBrowser', icon: FolderGit2 },
      { id: 'multiRepo', icon: Layers },
      { id: 'fileTools', icon: FileCode2 },
    ],
  },
  {
    id: 'auth',
    icon: ShieldCheck,
    features: [
      { id: 'providers', icon: ShieldCheck },
      { id: 'sessions', icon: KeyRound },
      { id: 'connectGitHub', icon: GitBranch },
      { id: 'perUser', icon: Users },
    ],
  },
  {
    id: 'queue',
    icon: ListOrdered,
    features: [
      { id: 'enqueue', icon: ListOrdered },
      { id: 'reorder', icon: GitCompareArrows },
      { id: 'autoDispatch', icon: Zap },
      { id: 'agentAdded', icon: Sparkles },
    ],
  },
  {
    id: 'mcp',
    icon: Blocks,
    features: [
      { id: 'marketplace', icon: Blocks },
      { id: 'servers', icon: Plug },
      { id: 'plugins', icon: Puzzle },
    ],
  },
  {
    id: 'infra',
    icon: Server,
    features: [
      { id: 'nextjs', icon: Server },
      { id: 'neon', icon: Database },
      { id: 'sandbox', icon: Box },
      { id: 'gateway', icon: Zap },
      { id: 'rateLimit', icon: ShieldAlert },
    ],
  },
  {
    id: 'ui',
    icon: LayoutDashboard,
    features: [
      { id: 'chat', icon: MessageSquare },
      { id: 'logs', icon: Terminal },
      { id: 'panels', icon: LayoutDashboard },
      { id: 'dialogs', icon: FileCode2 },
    ],
  },
]
