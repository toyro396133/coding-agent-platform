import type { McpMarketplaceEntry, McpMarketplaceCategoryInfo } from './types'

/**
 * Category definitions for the MCP Marketplace UI.
 */
export const MARKETPLACE_CATEGORIES: McpMarketplaceCategoryInfo[] = [
  { id: 'development', label: 'Development', icon: '💻' },
  { id: 'project-management', label: 'Project Mgmt', icon: '📋' },
  { id: 'communication', label: 'Communication', icon: '💬' },
  { id: 'design', label: 'Design', icon: '🎨' },
  { id: 'infrastructure', label: 'Infrastructure', icon: '☁️' },
  { id: 'monitoring', label: 'Monitoring', icon: '📊' },
  { id: 'database', label: 'Database', icon: '🗄️' },
  { id: 'ai', label: 'AI / ML', icon: '🤖' },
  { id: 'other', label: 'Other', icon: '🔌' },
]

/**
 * Built-in MCP server entries available in the marketplace.
 * Each entry can be one-click installed as a connector.
 */
export const MARKETPLACE_ENTRIES: McpMarketplaceEntry[] = [
  // ─── Development ─────────────────────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    description:
      'Manage issues, PRs, repos, and code reviews directly from your agent. Search code, create PRs, review diffs, and automate GitHub workflows.',
    category: 'development',
    type: 'remote',
    baseUrl: 'https://api.github.com/mcp',
    icon: '🐙',
    docsUrl: 'https://github.com/github/mcp-server',
    popularity: 100,
    requiresOAuth: true,
    installHint: 'Connect your GitHub account in Settings to auto-fill the token.',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Create and manage merge requests, issues, pipelines, and repository operations on GitLab.',
    category: 'development',
    type: 'remote',
    baseUrl: 'https://gitlab.com/api/mcp',
    icon: '🦊',
    docsUrl: 'https://docs.gitlab.com/ee/integration/mcp/',
    popularity: 85,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Create, update, and search issues. Manage projects, sprints, and roadmaps from your agent.',
    category: 'development',
    type: 'remote',
    baseUrl: 'https://mcp.linear.app/sse',
    icon: '📐',
    docsUrl: 'https://linear.app/docs/mcp',
    popularity: 80,
  },
  {
    id: 'jira',
    name: 'Jira',
    description:
      'Manage tickets, sprints, epics, and boards. Search issues, create tasks, update statuses, and generate reports.',
    category: 'development',
    type: 'remote',
    baseUrl: 'https://mcp.atlassian.com/jira',
    icon: '💼',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/mcp/',
    popularity: 90,
    requiresOAuth: true,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    description: 'Manage repos, PRs, pipelines, and wiki pages on Bitbucket Cloud.',
    category: 'development',
    type: 'remote',
    baseUrl: 'https://api.bitbucket.org/2.0/mcp',
    icon: '🪣',
    popularity: 50,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'View and manage errors, performance issues, and releases. Get stack traces and suggested fixes.',
    category: 'monitoring',
    type: 'remote',
    baseUrl: 'https://sentry.io/api/0/mcp',
    icon: '🚨',
    docsUrl: 'https://docs.sentry.io/api/mcp/',
    popularity: 75,
    envKeys: [
      { key: 'SENTRY_AUTH_TOKEN', label: 'Sentry Auth Token', required: true },
      { key: 'SENTRY_ORG', label: 'Sentry Organization Slug', required: true },
    ],
  },
  {
    id: 'datadog',
    name: 'Datadog',
    description: 'Monitor infrastructure, query metrics, manage dashboards, alerts, and incidents.',
    category: 'monitoring',
    type: 'remote',
    baseUrl: 'https://api.datadoghq.com/api/v2/mcp',
    icon: '🐕',
    docsUrl: 'https://docs.datadoghq.com/api/latest/',
    popularity: 60,
    envKeys: [
      { key: 'DATADOG_API_KEY', label: 'Datadog API Key', required: true },
      { key: 'DATADOG_APP_KEY', label: 'Datadog Application Key', required: true },
    ],
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    description: 'Manage incidents, on-call schedules, and escalation policies. Trigger or acknowledge alerts.',
    category: 'monitoring',
    type: 'remote',
    baseUrl: 'https://api.pagerduty.com/mcp',
    icon: '🆘',
    docsUrl: 'https://developer.pagerduty.com/api-reference/',
    popularity: 40,
  },

  // ─── Project Management ──────────────────────────────────────────
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read, create, and update pages, databases, and comments. Search your workspace and manage content.',
    category: 'project-management',
    type: 'remote',
    baseUrl: 'https://mcp.notion.com/mcp',
    icon: '📝',
    docsUrl: 'https://developers.notion.com/reference/mcp',
    popularity: 95,
    requiresOAuth: true,
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Manage tasks, projects, portfolios, and teams. Create and assign work, update due dates.',
    category: 'project-management',
    type: 'remote',
    baseUrl: 'https://app.asana.com/api/1.0/mcp',
    icon: '📋',
    docsUrl: 'https://developers.asana.com/docs/mcp',
    popularity: 55,
    requiresOAuth: true,
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Manage boards, lists, cards, and checklists. Move cards, add comments, and track progress.',
    category: 'project-management',
    type: 'remote',
    baseUrl: 'https://api.trello.com/1/mcp',
    icon: '📌',
    docsUrl: 'https://developer.atlassian.com/cloud/trello/guides/mcp/',
    popularity: 45,
  },

  // ─── Communication ───────────────────────────────────────────────
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages, search channels, manage threads, and react to messages. Post code snippets and files.',
    category: 'communication',
    type: 'remote',
    baseUrl: 'https://slack.com/api/mcp',
    icon: '💬',
    docsUrl: 'https://api.slack.com/mcp',
    popularity: 95,
    requiresOAuth: true,
    installHint: 'Requires a Slack app with the appropriate OAuth scopes.',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Send and read messages, manage channels, and interact with Discord servers from your agent.',
    category: 'communication',
    type: 'remote',
    baseUrl: 'https://discord.com/api/v10/mcp',
    icon: '🎮',
    docsUrl: 'https://discord.com/developers/docs/mcp',
    popularity: 70,
    envKeys: [{ key: 'DISCORD_BOT_TOKEN', label: 'Discord Bot Token', required: true }],
  },

  // ─── Design ──────────────────────────────────────────────────────
  {
    id: 'figma',
    name: 'Figma',
    description: 'Access design files, components, and prototypes. Extract design tokens and specs for implementation.',
    category: 'design',
    type: 'remote',
    baseUrl: 'https://mcp.figma.com/mcp',
    icon: '🎨',
    docsUrl: 'https://www.figma.com/developers/mcp',
    popularity: 85,
    requiresOAuth: true,
  },
  {
    id: 'excalidraw',
    name: 'Excalidraw',
    description: 'Create and edit whiteboard diagrams, wireframes, and architecture drawings collaboratively.',
    category: 'design',
    type: 'remote',
    baseUrl: 'https://excalidraw.com/api/mcp',
    icon: '✏️',
    popularity: 40,
  },

  // ─── Infrastructure ──────────────────────────────────────────────
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Manage deployments, environment variables, domains, and project settings on Vercel.',
    category: 'infrastructure',
    type: 'remote',
    baseUrl: 'https://api.vercel.com/v1/mcp',
    icon: '▲',
    docsUrl: 'https://vercel.com/docs/rest-api',
    popularity: 95,
    envKeys: [
      { key: 'VERCEL_TOKEN', label: 'Vercel API Token', required: true },
      { key: 'VERCEL_TEAM_ID', label: 'Vercel Team ID (optional)', required: false },
    ],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Manage DNS, Workers, KV, R2 buckets, and D1 databases. Configure caching and security rules.',
    category: 'infrastructure',
    type: 'remote',
    baseUrl: 'https://api.cloudflare.com/client/v4/mcp',
    icon: '☁️',
    docsUrl: 'https://developers.cloudflare.com/api/mcp/',
    popularity: 75,
    envKeys: [{ key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API Token', required: true }],
  },
  {
    id: 'aws',
    name: 'AWS',
    description: 'Manage EC2, Lambda, S3, DynamoDB, and other AWS services. Read cloud resources and configuration.',
    category: 'infrastructure',
    type: 'local',
    command: 'npx -y @aws/mcp-server',
    icon: '🌩️',
    docsUrl: 'https://docs.aws.amazon.com/mcp/',
    popularity: 80,
    envKeys: [
      { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', required: true },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', required: true },
      { key: 'AWS_REGION', label: 'AWS Region', required: true, description: 'e.g. us-east-1' },
    ],
  },

  // ─── Database ────────────────────────────────────────────────────
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Query and manage Postgres tables, auth users, storage buckets, and edge functions.',
    category: 'database',
    type: 'remote',
    baseUrl: 'https://mcp.supabase.com/mcp',
    icon: '🔥',
    docsUrl: 'https://supabase.com/docs/guides/platform/mcp',
    popularity: 80,
    envKeys: [
      { key: 'SUPABASE_URL', label: 'Supabase Project URL', required: true },
      { key: 'SUPABASE_SERVICE_KEY', label: 'Supabase Service Key', required: true },
    ],
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Manage Postgres databases, branches, and connection strings. Create branches for each task.',
    category: 'database',
    type: 'remote',
    baseUrl: 'https://console.neon.tech/api/v1/mcp',
    icon: '🐘',
    docsUrl: 'https://neon.tech/docs/mcp',
    popularity: 75,
    envKeys: [{ key: 'NEON_API_KEY', label: 'Neon API Key', required: true }],
  },
  {
    id: 'convex',
    name: 'Convex',
    description: 'Manage Convex backend: deploy functions, query tables, manage schemas, and view logs.',
    category: 'database',
    type: 'local',
    command: 'npx -y convex@latest mcp start',
    icon: '◀️',
    docsUrl: 'https://docs.convex.dev/mcp',
    popularity: 50,
  },

  // ─── AI / ML ─────────────────────────────────────────────────────
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Search models, datasets, and Spaces. Query the Hugging Face Hub for ML resources.',
    category: 'ai',
    type: 'remote',
    baseUrl: 'https://hf.co/mcp',
    icon: '🤗',
    docsUrl: 'https://huggingface.co/docs/hub/mcp',
    popularity: 60,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Call GPT models, manage assistants, create vector stores, and query knowledge bases.',
    category: 'ai',
    type: 'remote',
    baseUrl: 'https://api.openai.com/v1/mcp',
    icon: '🧠',
    docsUrl: 'https://platform.openai.com/docs/mcp',
    popularity: 70,
    envKeys: [{ key: 'OPENAI_API_KEY', label: 'OpenAI API Key', required: true }],
  },

  // ─── Other ──────────────────────────────────────────────────────
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation: navigate pages, take screenshots, fill forms, and run end-to-end tests.',
    category: 'other',
    type: 'local',
    command: 'npx -y @playwright/mcp@latest',
    icon: '🎭',
    docsUrl: 'https://playwright.dev/docs/mcp',
    popularity: 90,
  },
  {
    id: 'browserbase',
    name: 'Browserbase',
    description: 'Cloud browser automation with session recording, stealth mode, and AI-powered web interaction.',
    category: 'other',
    type: 'local',
    command: 'npx @browserbasehq/mcp',
    icon: '🌐',
    docsUrl: 'https://docs.browserbase.com/mcp',
    popularity: 65,
    envKeys: [
      { key: 'BROWSERBASE_API_KEY', label: 'Browserbase API Key', required: true },
      { key: 'BROWSERBASE_PROJECT_ID', label: 'Browserbase Project ID', required: true },
    ],
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'Fetch real-time context from documentation, Stack Overflow, GitHub discussions, and more.',
    category: 'other',
    type: 'remote',
    baseUrl: 'https://mcp.context7.com/mcp',
    icon: '🔍',
    docsUrl: 'https://context7.com/docs',
    popularity: 60,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Direct database access: query tables, run migrations, inspect schemas, and execute SQL.',
    category: 'database',
    type: 'local',
    command: 'npx -y @neondatabase/mcp-server',
    icon: '🗄️',
    docsUrl: 'https://neon.tech/docs/mcp',
    popularity: 85,
    envKeys: [
      {
        key: 'DATABASE_URL',
        label: 'Postgres Connection String',
        required: true,
        description: 'postgresql://user:pass@host:5432/db',
      },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Manage payments, subscriptions, invoices, and customers. Query charges and refunds.',
    category: 'infrastructure',
    type: 'remote',
    baseUrl: 'https://api.stripe.com/v1/mcp',
    icon: '💳',
    docsUrl: 'https://stripe.com/docs/api/mcp',
    popularity: 70,
    envKeys: [{ key: 'STRIPE_API_KEY', label: 'Stripe Secret Key', required: true }],
  },
  {
    id: 'resend',
    name: 'Resend',
    description: 'Send transactional emails, manage audiences, and track email delivery from your agent.',
    category: 'communication',
    type: 'remote',
    baseUrl: 'https://api.resend.com/mcp',
    icon: '✉️',
    docsUrl: 'https://resend.com/docs/api-reference/introduction',
    popularity: 50,
    envKeys: [{ key: 'RESEND_API_KEY', label: 'Resend API Key', required: true }],
  },
]

/**
 * Get all marketplace entries, sorted by popularity (descending).
 */
export function getMarketplaceEntries(): McpMarketplaceEntry[] {
  return [...MARKETPLACE_ENTRIES].sort((a, b) => b.popularity - a.popularity)
}

/**
 * Get marketplace entries filtered by category.
 */
export function getEntriesByCategory(category: string): McpMarketplaceEntry[] {
  return MARKETPLACE_ENTRIES.filter((e) => e.category === category).sort((a, b) => b.popularity - a.popularity)
}

/**
 * Get a single marketplace entry by ID.
 */
export function getMarketplaceEntry(id: string): McpMarketplaceEntry | undefined {
  return MARKETPLACE_ENTRIES.find((e) => e.id === id)
}

/**
 * Search marketplace entries by name, description, or category.
 */
export function searchMarketplace(query: string): McpMarketplaceEntry[] {
  const lower = query.toLowerCase()
  return MARKETPLACE_ENTRIES.filter(
    (e) =>
      e.name.toLowerCase().includes(lower) ||
      e.description.toLowerCase().includes(lower) ||
      e.category.toLowerCase().includes(lower),
  ).sort((a, b) => b.popularity - a.popularity)
}
