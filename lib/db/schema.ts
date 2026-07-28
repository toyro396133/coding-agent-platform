import { pgTable, text, timestamp, integer, jsonb, boolean, uniqueIndex, index, vector } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { nanoid } from 'nanoid'

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
      enum: ['github', 'vercel', 'credentials'],
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
  }),
)

export const insertUserSchema = z.object({
  id: z.string().optional(), // Auto-generated if not provided
  provider: z.enum(['github', 'vercel', 'credentials']),
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
  provider: z.enum(['github', 'vercel', 'credentials']),
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
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']).default('pending'),
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
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']),
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
// Currently only GitHub can be connected as an additional account
// (e.g., Vercel users can connect their GitHub account)
// Multiple users can connect to the same external account (each as a separate record)
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
    provider: text('provider', {
      enum: ['github'],
    })
      .notNull()
      .default('github'), // Only GitHub for now
    externalUserId: text('external_user_id').notNull(), // GitHub user ID
    accessToken: text('access_token').notNull(), // Encrypted OAuth access token
    refreshToken: text('refresh_token'), // Encrypted OAuth refresh token
    expiresAt: timestamp('expires_at'),
    scope: text('scope'),
    username: text('username').notNull(), // GitHub username
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: a user can only have one account per provider
    userIdProviderUnique: uniqueIndex('accounts_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

export const insertAccountSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['github']).default('github'),
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
  provider: z.enum(['github']),
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

export const taskPlans = pgTable('task_plans', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  planContent: jsonb('plan_content').notNull(),
  hash: text('hash').notNull(),
  version: integer('version').notNull().default(1),
  status: text('status', {
    enum: ['pending_approval', 'approved', 'rejected'],
  })
    .notNull()
    .default('pending_approval'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const insertTaskPlanSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  planContent: z.any(),
  hash: z.string().min(1, 'Hash is required'),
  version: z.number().optional(),
  status: z.enum(['pending_approval', 'approved', 'rejected']).optional(),
  approvedAt: z.date().optional().nullable(),
  createdAt: z.date().optional(),
})

export const selectTaskPlanSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  planContent: z.any(),
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
