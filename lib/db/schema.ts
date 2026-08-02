import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { type PlanContent, planContentSchema } from '@/lib/ai/orchestrator/capabilities/plan-tools'

// Worker team config type (stored as JSONB on tasks)
export interface WorkerTeamConfigData {
  workers: {
    id: string
    role: string
    agentType: string
    model: string
    instructions: string
    priority: number
  }[]
  timeoutMinutes: number
}

// Log entry types
export const logEntrySchema = z.object({
  type: z.enum(['info', 'command', 'error', 'success']),
  message: z.string(),
  timestamp: z.date().optional(),
})

export type LogEntry = z.infer<typeof logEntrySchema>

// Users table - user profile and primary OAuth account
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Internal user ID (we generate this)
    // Primary OAuth account info (how they signed in)
    provider: text('provider', {
      enum: ['github', 'vercel', 'credentials', 'google', 'discord'],
    }).notNull(), // Primary auth provider
    externalId: text('external_id').notNull(), // External ID from OAuth provider
    accessToken: text('access_token').notNull(), // Encrypted OAuth access token
    refreshToken: text('refresh_token'), // Encrypted OAuth refresh token
    scope: text('scope'), // OAuth scope
    // Profile info
    username: text('username').notNull(),
    email: text('email'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    passwordHash: text('password_hash'),
    locale: text('locale').default('he').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: prevent duplicate signups from same provider + external ID
    providerExternalIdUnique: uniqueIndex('users_provider_external_id_idx').on(table.provider, table.externalId),
    // Index for email lookups (used by cross-provider identity merging)
    emailIdx: index('users_email_idx').on(table.email),
  }),
)

export const insertUserSchema = z.object({
  id: z.string().optional(), // Auto-generated if not provided
  provider: z.enum(['github', 'vercel', 'credentials', 'google', 'discord']),
  externalId: z.string().min(1, 'External ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  scope: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  email: z.string().email().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  passwordHash: z.string().optional(),
  locale: z.enum(['en', 'he']).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  lastLoginAt: z.date().optional(),
})

export const selectUserSchema = z.object({
  id: z.string(),
  provider: z.enum(['github', 'vercel', 'credentials', 'google', 'discord']),
  externalId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  passwordHash: z.string().nullable(),
  locale: z.enum(['en', 'he']).default('he'),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date(),
})

export type User = z.infer<typeof selectUserSchema>
export type InsertUser = z.infer<typeof insertUserSchema>

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
  prompt: text('prompt').notNull(),
  title: text('title'),
  repoUrl: text('repo_url'),
  selectedAgent: text('selected_agent').default('claude'),
  selectedModel: text('selected_model'),
  installDependencies: boolean('install_dependencies').default(false),
  maxDuration: integer('max_duration').default(parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)),
  keepAlive: boolean('keep_alive').default(false),
  enableBrowser: boolean('enable_browser').default(false),
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'error', 'stopped', 'PLANNING_PENDING_APPROVAL'],
  })
    .notNull()
    .default('pending'),
  progress: integer('progress').default(0),
  logs: jsonb('logs').$type<LogEntry[]>(),
  error: text('error'),
  branchName: text('branch_name'),
  sandboxId: text('sandbox_id'),
  agentSessionId: text('agent_session_id'),
  sandboxUrl: text('sandbox_url'),
  previewUrl: text('preview_url'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  prStatus: text('pr_status', {
    enum: ['open', 'closed', 'merged'],
  }),
  prMergeCommitSha: text('pr_merge_commit_sha'),
  mcpServerIds: jsonb('mcp_server_ids').$type<string[]>(),
  workerTeamConfig: jsonb('worker_team_config').$type<WorkerTeamConfigData>(),
  executionMode: text('execution_mode', {
    enum: ['orchestrator_external', 'orchestrator_only', 'external_only'],
  })
    .notNull()
    .default('orchestrator_external'),
  executionLevel: text('execution_level', {
    enum: ['basic', 'enhanced', 'auto'],
  })
    .notNull()
    .default('basic'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  deletedAt: timestamp('deleted_at'),
})

// Manual Zod schemas for validation
export const insertTaskSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  title: z.string().optional(),
  repoUrl: z.string().url('Must be a valid URL').optional(),
  selectedAgent: z.enum(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode']).default('claude'),
  selectedModel: z.string().optional(),
  installDependencies: z.boolean().default(false),
  maxDuration: z.number().default(parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)),
  keepAlive: z.boolean().default(false),
  enableBrowser: z.boolean().default(false),
  status: z
    .enum(['pending', 'processing', 'completed', 'error', 'stopped', 'PLANNING_PENDING_APPROVAL'])
    .default('pending'),
  progress: z.number().min(0).max(100).default(0),
  logs: z.array(logEntrySchema).optional(),
  error: z.string().optional(),
  branchName: z.string().optional(),
  sandboxId: z.string().optional(),
  agentSessionId: z.string().optional(),
  sandboxUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  prStatus: z.enum(['open', 'closed', 'merged']).optional(),
  prMergeCommitSha: z.string().optional(),
  mcpServerIds: z.array(z.string()).optional(),
  workerTeamConfig: z
    .object({
      workers: z.array(
        z.object({
          id: z.string(),
          role: z.string(),
          agentType: z.string(),
          model: z.string(),
          instructions: z.string(),
          priority: z.number(),
        }),
      ),
      timeoutMinutes: z.number(),
    })
    .optional(),
  executionMode: z
    .enum(['orchestrator_external', 'orchestrator_only', 'external_only'])
    .default('orchestrator_external'),
  executionLevel: z.enum(['basic', 'enhanced', 'auto']).default('basic'),
})

export const selectTaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  prompt: z.string(),
  title: z.string().nullable(),
  repoUrl: z.string().nullable(),
  selectedAgent: z.string().nullable(),
  selectedModel: z.string().nullable(),
  installDependencies: z.boolean().nullable(),
  maxDuration: z.number().nullable(),
  keepAlive: z.boolean().nullable(),
  enableBrowser: z.boolean().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped', 'PLANNING_PENDING_APPROVAL']),
  progress: z.number().nullable(),
  logs: z.array(logEntrySchema).nullable(),
  error: z.string().nullable(),
  branchName: z.string().nullable(),
  sandboxId: z.string().nullable(),
  agentSessionId: z.string().nullable(),
  sandboxUrl: z.string().nullable(),
  previewUrl: z.string().nullable(),
  prUrl: z.string().nullable(),
  prNumber: z.number().nullable(),
  prStatus: z.enum(['open', 'closed', 'merged']).nullable(),
  prMergeCommitSha: z.string().nullable(),
  mcpServerIds: z.array(z.string()).nullable(),
  workerTeamConfig: z
    .object({
      workers: z.array(
        z.object({
          id: z.string(),
          role: z.string(),
          agentType: z.string(),
          model: z.string(),
          instructions: z.string(),
          priority: z.number(),
        }),
      ),
      timeoutMinutes: z.number(),
    })
    .nullable(),
  executionMode: z.enum(['orchestrator_external', 'orchestrator_only', 'external_only']),
  executionLevel: z.enum(['basic', 'enhanced', 'auto']).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
})

export type Task = z.infer<typeof selectTaskSchema>
export type InsertTask = z.infer<typeof insertTaskSchema>

export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
  name: text('name').notNull(),
  description: text('description'),
  type: text('type', {
    enum: ['local', 'remote'],
  })
    .notNull()
    .default('remote'),
  // For remote MCP servers
  baseUrl: text('base_url'),
  oauthClientId: text('oauth_client_id'),
  oauthClientSecret: text('oauth_client_secret'),
  // For local MCP servers
  command: text('command'),
  // Environment variables (for both local and remote) - stored encrypted
  env: text('env'),
  status: text('status', {
    enum: ['connected', 'disconnected'],
  })
    .notNull()
    .default('disconnected'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const insertConnectorSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['local', 'remote']).default('remote'),
  // For remote MCP servers
  baseUrl: z.string().url('Must be a valid URL').optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  // For local MCP servers
  command: z.string().optional(),
  // Environment variables (for both local and remote) - will be encrypted
  env: z.record(z.string(), z.string()).optional(),
  status: z.enum(['connected', 'disconnected']).default('disconnected'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectConnectorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['local', 'remote']),
  // For remote MCP servers
  baseUrl: z.string().nullable(),
  oauthClientId: z.string().nullable(),
  oauthClientSecret: z.string().nullable(),
  // For local MCP servers
  command: z.string().nullable(),
  // Environment variables (for both local and remote) - stored encrypted as string
  env: z.string().nullable(),
  status: z.enum(['connected', 'disconnected']),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Connector = z.infer<typeof selectConnectorSchema>
export type InsertConnector = z.infer<typeof insertConnectorSchema>

// Accounts table - Additional accounts linked to users
// Stores all OAuth accounts connected to a user, including the primary sign-in
// provider (also stored in users table) and any additional linked accounts.
// Cross-provider merge: when a user signs in with a different provider but
// with the same verified email, the accounts are linked under one user ID.
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
    provider: text('provider', {
      enum: ['github', 'google', 'discord'],
    }).notNull(),
    externalUserId: text('external_user_id').notNull(), // External ID from the OAuth provider
    accessToken: text('access_token').notNull(), // Encrypted OAuth access token
    refreshToken: text('refresh_token'), // Encrypted OAuth refresh token
    expiresAt: timestamp('expires_at'),
    scope: text('scope'),
    username: text('username').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: a user can only have one account per provider
    userIdProviderUnique: uniqueIndex('accounts_user_id_provider_idx').on(table.userId, table.provider),
    // Index for looking up accounts by provider + external user ID
    providerExternalUserIdIdx: index('accounts_provider_external_user_id_idx').on(table.provider, table.externalUserId),
  }),
)

export const insertAccountSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['github', 'google', 'discord']),
  externalUserId: z.string().min(1, 'External user ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional(),
  scope: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['github', 'google', 'discord']),
  externalUserId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.date().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Account = z.infer<typeof selectAccountSchema>
export type InsertAccount = z.infer<typeof insertAccountSchema>

// Keys table - user's API keys for various services
// Each row represents one API key for one provider for one user
export const keys = pgTable(
  'keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
    provider: text('provider', {
      enum: ['anthropic', 'openai', 'cursor', 'gemini', 'aigateway'],
    }).notNull(),
    value: text('value').notNull(), // Encrypted API key value
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: a user can only have one key per provider
    userIdProviderUnique: uniqueIndex('keys_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

export const insertKeySchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'cursor', 'gemini', 'aigateway']),
  value: z.string().min(1, 'API key value is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'cursor', 'gemini', 'aigateway']),
  value: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Key = z.infer<typeof selectKeySchema>
export type InsertKey = z.infer<typeof insertKeySchema>

// Platform API Keys table - keys issued BY the platform to users for external API access
export const platformApiKeys = pgTable(
  'platform_api_keys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    hashedValue: text('hashed_value').notNull(),
    hint: text('hint').notNull(), // e.g. sk-platform-...1234
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    hashedValueIdx: index('platform_api_keys_hashed_value_idx').on(table.hashedValue),
    userIdCreatedAtIdx: index('platform_api_keys_user_id_created_at_idx').on(table.userId, table.createdAt),
  }),
)

export const insertPlatformApiKeySchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().min(1, 'Name is required'),
  hashedValue: z.string().min(1, 'Hashed value is required'),
  hint: z.string().min(1, 'Hint is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectPlatformApiKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  hashedValue: z.string(),
  hint: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type PlatformApiKey = z.infer<typeof selectPlatformApiKeySchema>
export type InsertPlatformApiKey = z.infer<typeof insertPlatformApiKeySchema>

// Task messages table - stores user and agent messages for each task
export const taskMessages = pgTable('task_messages', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }), // Foreign key to tasks table
  role: text('role', {
    enum: ['user', 'agent'],
  }).notNull(), // Who sent the message
  content: text('content').notNull(), // The message content
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insertTaskMessageSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  role: z.enum(['user', 'agent']),
  content: z.string().min(1, 'Content is required'),
  createdAt: z.date().optional(),
})

export const selectTaskMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  createdAt: z.date(),
})

export type TaskMessage = z.infer<typeof selectTaskMessageSchema>
export type InsertTaskMessage = z.infer<typeof insertTaskMessageSchema>

// Settings table - key-value pairs for overriding environment variables per user
export const settings = pgTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Required user reference
    key: text('key').notNull(), // Setting key (e.g., 'maxMessagesPerDay')
    value: text('value').notNull(), // Setting value (stored as text)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: prevent duplicate keys per user
    userIdKeyUnique: uniqueIndex('settings_user_id_key_idx').on(table.userId, table.key),
  }),
)

export const insertSettingSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  key: z.string().min(1, 'Key is required'),
  value: z.string().min(1, 'Value is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectSettingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  key: z.string(),
  value: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Setting = z.infer<typeof selectSettingSchema>
export type InsertSetting = z.infer<typeof insertSettingSchema>

// Keep legacy export for backwards compatibility during migration
export const userConnections = accounts
export type UserConnection = Account
export type InsertUserConnection = InsertAccount

// Memories table - stores summaries of completed tasks with vector embeddings for semantic search
export const memories = pgTable(
  'memories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }), // Optional: Can link memory to specific task
    content: text('content').notNull(), // The summary text
    embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small dimension
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('memories_user_id_idx').on(table.userId),
    embeddingIdx: index('memories_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  }),
)

export const insertMemorySchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  taskId: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  // We typically don't expose the embedding in Zod input for the API directly
  createdAt: z.date().optional(),
})

export const selectMemorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  taskId: z.string().nullable(),
  content: z.string(),
  createdAt: z.date(),
  // Omit embedding from default select schema for cleaner API responses
})

export type Memory = z.infer<typeof selectMemorySchema>
export type InsertMemory = z.infer<typeof insertMemorySchema>

export const proposalsBank = pgTable('proposals_bank', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').array(),
  status: text('status', {
    enum: ['pending', 'accepted', 'rejected'],
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insertProposalSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  tags: z.array(z.string()).optional(),
  status: z.enum(['pending', 'accepted', 'rejected']).optional(),
  createdAt: z.date().optional(),
})

export const selectProposalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).nullable(),
  status: z.enum(['pending', 'accepted', 'rejected']).nullable(),
  createdAt: z.date(),
})

export type Proposal = z.infer<typeof selectProposalSchema>
export type InsertProposal = z.infer<typeof insertProposalSchema>

export const backgroundTestsBank = pgTable('background_tests_bank', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  description: text('description'),
  tags: text('tags').array(),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insertBackgroundTestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  createdAt: z.date().optional(),
})

export const selectBackgroundTestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  isEnabled: z.boolean().nullable(),
  createdAt: z.date(),
})

export type BackgroundTest = z.infer<typeof selectBackgroundTestSchema>
export type InsertBackgroundTest = z.infer<typeof insertBackgroundTestSchema>

export const backgroundTestExecutions = pgTable(
  'background_test_executions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    testId: text('test_id')
      .notNull()
      .references(() => backgroundTestsBank.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['passed', 'failed', 'remediated'],
    }).notNull(),
    logs: text('logs'),
    remediationPatch: jsonb('remediation_patch'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskIdCreatedAtIdx: index('background_test_executions_task_id_created_at_idx').on(table.taskId, table.createdAt),
  }),
)

export const insertBackgroundTestExecutionSchema = z.object({
  id: z.string().optional(),
  testId: z.string().min(1, 'Test ID is required'),
  taskId: z.string().optional().nullable(),
  status: z.enum(['passed', 'failed', 'remediated']),
  logs: z.string().optional().nullable(),
  remediationPatch: z.any().optional().nullable(),
  createdAt: z.date().optional(),
})

export const selectBackgroundTestExecutionSchema = z.object({
  id: z.string(),
  testId: z.string(),
  taskId: z.string().nullable(),
  status: z.enum(['passed', 'failed', 'remediated']),
  logs: z.string().nullable(),
  remediationPatch: z.any().nullable(),
  createdAt: z.date(),
})

export type BackgroundTestExecution = z.infer<typeof selectBackgroundTestExecutionSchema>
export type InsertBackgroundTestExecution = z.infer<typeof insertBackgroundTestExecutionSchema>

export const repositoryEmbeddings = pgTable(
  'repository_embeddings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    repoUrl: text('repo_url').notNull(),
    filePath: text('file_path').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdRepoIdx: index('repository_embeddings_user_repo_idx').on(table.userId, table.repoUrl),
    embeddingIdx: index('repository_embeddings_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  }),
)

export const insertRepositoryEmbeddingSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  repoUrl: z.string().min(1, 'Repo URL is required'),
  filePath: z.string().min(1, 'File path is required'),
  content: z.string().min(1, 'Content is required'),
  createdAt: z.date().optional(),
})

export const selectRepositoryEmbeddingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  repoUrl: z.string(),
  filePath: z.string(),
  content: z.string(),
  createdAt: z.date(),
})

export type RepositoryEmbedding = z.infer<typeof selectRepositoryEmbeddingSchema>
export type InsertRepositoryEmbedding = z.infer<typeof insertRepositoryEmbeddingSchema>

export const taskPlans = pgTable(
  'task_plans',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    planContent: jsonb('plan_content').$type<PlanContent>().notNull(),
    hash: text('hash').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status', {
      enum: ['pending_approval', 'approved', 'rejected'],
    })
      .notNull()
      .default('pending_approval'),
    approvedAt: timestamp('approved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskVersionUnique: unique('task_plans_task_id_version_unique').on(table.taskId, table.version),
  }),
)

export const insertTaskPlanSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  planContent: planContentSchema,
  hash: z.string().min(1, 'Hash is required'),
  version: z.number().optional(),
  status: z.enum(['pending_approval', 'approved', 'rejected']).optional(),
  approvedAt: z.date().optional().nullable(),
  createdAt: z.date().optional(),
})

export const selectTaskPlanSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  planContent: planContentSchema,
  hash: z.string(),
  version: z.number(),
  status: z.enum(['pending_approval', 'approved', 'rejected']),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
})

export type TaskPlan = z.infer<typeof selectTaskPlanSchema>
export type InsertTaskPlan = z.infer<typeof insertTaskPlanSchema>

export const projectRules = pgTable(
  'project_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    repoUrl: text('repo_url').notNull(),
    ruleContent: text('rule_content').notNull(),
    isApproved: boolean('is_approved').default(false).notNull(),
    sourceTaskId: text('source_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdRepoIdx: index('project_rules_user_repo_idx').on(table.userId, table.repoUrl),
  }),
)

export const insertProjectRuleSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  repoUrl: z.string().min(1, 'Repo URL is required'),
  ruleContent: z.string().min(1, 'Rule content is required'),
  isApproved: z.boolean().optional(),
  sourceTaskId: z.string().optional().nullable(),
  createdAt: z.date().optional(),
})

export const selectProjectRuleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  repoUrl: z.string(),
  ruleContent: z.string(),
  isApproved: z.boolean(),
  sourceTaskId: z.string().nullable(),
  createdAt: z.date(),
})

export type ProjectRule = z.infer<typeof selectProjectRuleSchema>
export type InsertProjectRule = z.infer<typeof insertProjectRuleSchema>

// Checkpoints table - tracks codebase state snapshots at key milestones
// Used by the checkpoint system for review/rollback functionality
export const checkpoints = pgTable(
  'checkpoints',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description'),
    fileStates: jsonb('file_states').$type<Record<string, string>>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, string>>(),
    status: text('status', {
      enum: ['active', 'accepted', 'rejected', 'rolled_back'],
    })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskIdIdx: index('checkpoints_task_id_idx').on(table.taskId),
  }),
)

export const insertCheckpointSchema = z.object({
  id: z.string(),
  taskId: z.string().min(1, 'Task ID is required'),
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
  fileStates: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.string()).optional(),
  status: z.enum(['active', 'accepted', 'rejected', 'rolled_back']).optional(),
  createdAt: z.date().optional(),
})

export const selectCheckpointSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  fileStates: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.string()).nullable(),
  status: z.enum(['active', 'accepted', 'rejected', 'rolled_back']),
  createdAt: z.date(),
})

export type Checkpoint = z.infer<typeof selectCheckpointSchema>
export type InsertCheckpoint = z.infer<typeof insertCheckpointSchema>

// ─── Visual QA Runs ─────────────────────────────────────────────────────
// Stores screenshots + vision-model critiques produced by the orchestrator's
// visual QA tools, so results (and history) can be shown in the task UI.

export const visualQaRuns = pgTable(
  'visual_qa_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    prompt: text('prompt').notNull(),
    verdict: text('verdict', {
      enum: ['pass', 'fail', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    critique: text('critique').notNull(),
    screenshotBase64: text('screenshot_base64').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskIdIdx: index('visual_qa_runs_task_id_idx').on(table.taskId),
  }),
)

export const insertVisualQaRunSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  url: z.string().min(1, 'URL is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  verdict: z.enum(['pass', 'fail', 'unknown']).default('unknown'),
  critique: z.string().min(1, 'Critique is required'),
  screenshotBase64: z.string().min(1, 'Screenshot is required'),
  createdAt: z.date().optional(),
})

export const selectVisualQaRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  userId: z.string(),
  url: z.string(),
  prompt: z.string(),
  verdict: z.enum(['pass', 'fail', 'unknown']),
  critique: z.string(),
  screenshotBase64: z.string(),
  createdAt: z.date(),
})

export type VisualQaRun = z.infer<typeof selectVisualQaRunSchema>
export type InsertVisualQaRun = z.infer<typeof insertVisualQaRunSchema>

// ─── Provider Usage Tracking ────────────────────────────────────────────
// Tracks API usage per provider for rate limiting and key rotation.

export const providerUsage = pgTable(
  'provider_usage',
  {
    id: text('id').primaryKey(),
    provider: text('provider', {
      enum: ['openai', 'anthropic', 'gemini', 'cursor', 'deepseek', 'aigateway'],
    }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    windowStart: timestamp('window_start').notNull(),
    windowReset: timestamp('window_reset').notNull(),
    isExhausted: boolean('is_exhausted').notNull().default(false),
    quotaWindowDay: text('quota_window_day').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    providerDayIdx: index('provider_usage_provider_day_idx').on(table.provider, table.quotaWindowDay),
  }),
)

export const insertProviderUsageSchema = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'gemini', 'cursor', 'deepseek', 'aigateway']),
  requestCount: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  windowStart: z.date(),
  windowReset: z.date(),
  isExhausted: z.boolean().optional(),
  quotaWindowDay: z.string(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectProviderUsageSchema = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'gemini', 'cursor', 'deepseek', 'aigateway']),
  requestCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  windowStart: z.date(),
  windowReset: z.date(),
  isExhausted: z.boolean(),
  quotaWindowDay: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ProviderUsage = z.infer<typeof selectProviderUsageSchema>
export type InsertProviderUsage = z.infer<typeof insertProviderUsageSchema>

// ─── API Key Pool ───────────────────────────────────────────────────────
// Multiple API keys per provider for rotation and fallback.

export const poolApiKeys = pgTable(
  'pool_api_keys',
  {
    id: text('id').primaryKey(),
    provider: text('provider', {
      enum: ['openai', 'anthropic', 'gemini', 'cursor', 'deepseek', 'aigateway'],
    }).notNull(),
    label: text('label').notNull(),
    value: text('value').notNull(),
    isExhausted: boolean('is_exhausted').notNull().default(false),
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at'),
    exhaustedAt: timestamp('exhausted_at'),
    quotaResetMinutes: integer('quota_reset_minutes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    providerIdx: index('pool_api_keys_provider_idx').on(table.provider),
  }),
)

export const insertPoolApiKeySchema = z.object({
  id: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'gemini', 'cursor', 'deepseek', 'aigateway']),
  label: z.string().min(1, 'Label is required'),
  value: z.string().min(1, 'Value is required'),
  isExhausted: z.boolean().optional(),
  usageCount: z.number().optional(),
  lastUsedAt: z.date().optional().nullable(),
  exhaustedAt: z.date().optional().nullable(),
  quotaResetMinutes: z.number().optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  deletedAt: z.date().optional().nullable(),
})

export const selectPoolApiKeySchema = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'gemini', 'cursor', 'deepseek', 'aigateway']),
  label: z.string(),
  value: z.string(),
  isExhausted: z.boolean(),
  usageCount: z.number(),
  lastUsedAt: z.date().nullable(),
  exhaustedAt: z.date().nullable(),
  quotaResetMinutes: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export type PoolApiKey = z.infer<typeof selectPoolApiKeySchema>
export type InsertPoolApiKey = z.infer<typeof insertPoolApiKeySchema>

// ─── User Request Queue ─────────────────────────────────────────────────
// A real queue of user/agent requests that wait to be executed sequentially.
// Distinct from the agent's internal to-do list (`tasks`): items here are
// enqueued by the user (or by the agent as follow-up steps) and are
// auto-dispatched in order once the currently running task completes.

export const requestQueue = pgTable(
  'request_queue',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    title: text('title'),
    repoUrl: text('repo_url'),
    selectedAgent: text('selected_agent').notNull().default('claude'),
    selectedModel: text('selected_model'),
    installDependencies: boolean('install_dependencies').notNull().default(false),
    keepAlive: boolean('keep_alive').notNull().default(false),
    enableBrowser: boolean('enable_browser').notNull().default(false),
    maxDuration: integer('max_duration'),
    /** Ordering within the user's queue (lower = earlier) */
    position: integer('position').notNull().default(0),
    /** queued → processing → completed | error | stopped */
    status: text('status', {
      enum: ['queued', 'processing', 'completed', 'error', 'stopped'],
    })
      .notNull()
      .default('queued'),
    /** Who added this request — the user or the agent (follow-up step) */
    source: text('source', {
      enum: ['user', 'agent'],
    })
      .notNull()
      .default('user'),
    /** Linked task once this request is dispatched for execution */
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    error: text('error'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    userIdIdx: index('request_queue_user_id_idx').on(table.userId),
    userPositionIdx: index('request_queue_user_position_idx').on(table.userId, table.position),
  }),
)

export const insertRequestQueueSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  title: z.string().optional().nullable(),
  repoUrl: z.string().optional().nullable(),
  selectedAgent: z.string().optional().default('claude'),
  selectedModel: z.string().optional().nullable(),
  installDependencies: z.boolean().optional().default(false),
  keepAlive: z.boolean().optional().default(false),
  enableBrowser: z.boolean().optional().default(false),
  maxDuration: z.number().optional().nullable(),
  position: z.number().optional().default(0),
  status: z.enum(['queued', 'processing', 'completed', 'error', 'stopped']).optional().default('queued'),
  source: z.enum(['user', 'agent']).optional().default('user'),
  taskId: z.string().optional().nullable(),
  error: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  completedAt: z.date().optional().nullable(),
  deletedAt: z.date().optional().nullable(),
})

export const selectRequestQueueSchema = z.object({
  id: z.string(),
  userId: z.string(),
  prompt: z.string(),
  title: z.string().nullable(),
  repoUrl: z.string().nullable(),
  selectedAgent: z.string(),
  selectedModel: z.string().nullable(),
  installDependencies: z.boolean(),
  keepAlive: z.boolean(),
  enableBrowser: z.boolean(),
  maxDuration: z.number().nullable(),
  position: z.number(),
  status: z.enum(['queued', 'processing', 'completed', 'error', 'stopped']),
  source: z.enum(['user', 'agent']),
  taskId: z.string().nullable(),
  error: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
})

export type RequestQueue = z.infer<typeof selectRequestQueueSchema>
export type InsertRequestQueue = z.infer<typeof insertRequestQueueSchema>

// ─── Merge Tokens ───────────────────────────────────────────────────────
// One-time tokens used for the cross-provider account merge confirmation flow.
// When a user signs in with a new provider that shares a verified email with
// an existing account, a token is created. The user must confirm the merge
// (via the MergeAccountsDialog) before the accounts are linked.

export const mergeTokens = pgTable('merge_tokens', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  /** The existing user ID that the new provider will be merged into */
  targetUserId: text('target_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The new provider being linked */
  provider: text('provider', {
    enum: ['github', 'google', 'discord'],
  }).notNull(),
  /** The external user ID from the new provider */
  externalUserId: text('external_user_id').notNull(),
  /** The encrypted access token for the new provider */
  accessToken: text('access_token').notNull(),
  /** The encrypted refresh token (if any) for the new provider */
  refreshToken: text('refresh_token'),
  /** The OAuth scope for the new provider */
  scope: text('scope'),
  /** The username from the new provider */
  username: text('username').notNull(),
  /** Email that matched during the merge request */
  matchedEmail: text('matched_email').notNull(),
  /** pending → confirmed → expired */
  status: text('status', {
    enum: ['pending', 'confirmed', 'expired'],
  })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  confirmedAt: timestamp('confirmed_at'),
})

export const insertMergeTokenSchema = z.object({
  id: z.string().optional(),
  targetUserId: z.string().min(1, 'Target user ID is required'),
  provider: z.enum(['github', 'google', 'discord']),
  externalUserId: z.string().min(1, 'External user ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  username: z.string().min(1, 'Username is required'),
  matchedEmail: z.string().email(),
  status: z.enum(['pending', 'confirmed', 'expired']).optional().default('pending'),
  createdAt: z.date().optional(),
  expiresAt: z.date(),
  confirmedAt: z.date().optional().nullable(),
})

export const selectMergeTokenSchema = z.object({
  id: z.string(),
  targetUserId: z.string(),
  provider: z.enum(['github', 'google', 'discord']),
  externalUserId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  matchedEmail: z.string(),
  status: z.enum(['pending', 'confirmed', 'expired']),
  createdAt: z.date(),
  expiresAt: z.date(),
  confirmedAt: z.date().nullable(),
})

export type MergeToken = z.infer<typeof selectMergeTokenSchema>
export type InsertMergeToken = z.infer<typeof insertMergeTokenSchema>
