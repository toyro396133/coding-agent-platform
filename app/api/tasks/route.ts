import { NextRequest, NextResponse, after } from 'next/server'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { getSubAgentModel } from '@/lib/ai/router'
import { getModelClient } from '@/lib/ai/models'
import { Sandbox } from '@vercel/sandbox'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema, connectors, taskMessages } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { createSandbox } from '@/lib/sandbox/creation'
import { executeAgentInSandbox, AgentType } from '@/lib/sandbox/agents'
import { pushChangesToBranch, shutdownSandbox } from '@/lib/sandbox/git'
import { unregisterSandbox } from '@/lib/sandbox/sandbox-registry'
import { detectPackageManager } from '@/lib/sandbox/package-manager'
import { runCommandInSandbox, runInProject, PROJECT_DIR } from '@/lib/sandbox/commands'
import { detectPortFromRepo } from '@/lib/sandbox/port-detection'
import { eq, desc, or, and, isNull } from 'drizzle-orm'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { generateTaskTitle, createFallbackTitle } from '@/lib/utils/title-generator'
import { generateCommitMessage, createFallbackCommitMessage } from '@/lib/utils/commit-message-generator'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'
import { parseMentionsAndInjectContext } from '@/lib/memory/mention-parser'
import { retrieveRelevantMemories } from '@/lib/memory/engine'

import { summarizeAndStoreTask } from '@/lib/memory/summarize'

import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getMaxSandboxDuration } from '@/lib/db/settings'

export async function GET() {
  try {
    // Get user session
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get tasks for this user only (exclude soft-deleted tasks)
    const userTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))

    return NextResponse.json({ tasks: userTasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(session.user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have reached the daily limit of ${rateLimit.total} messages (tasks + follow-ups). Your limit will reset at ${rateLimit.resetAt.toISOString()}`,
          remaining: rateLimit.remaining,
          total: rateLimit.total,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 },
      )
    }

    const body = await request.json()

    // Use provided ID or generate a new one
    const taskId = body.id || generateId(12)
    const validatedData = insertTaskSchema.parse({
      ...body,
      id: taskId,
      userId: session.user.id,
      status: 'pending',
      progress: 0,
      logs: [],
    })

    // Insert the task into the database - ensure id is definitely present
    const [newTask] = await db
      .insert(tasks)
      .values({
        ...validatedData,
        id: taskId, // Ensure id is always present
      })
      .returning()

    // Generate AI branch name after response is sent (non-blocking)
    after(async () => {
      try {
        // Check if AI Gateway API key is available
        if (!process.env.AI_GATEWAY_API_KEY) {
          console.log('AI_GATEWAY_API_KEY not available, skipping AI branch name generation')
          return
        }

        const logger = createTaskLogger(taskId)
        await logger.info('Generating AI-powered branch name...')

        // Extract repository name from URL for context
        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        // Generate AI branch name
        const aiBranchName = await generateBranchName({
          description: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        // Update task with AI-generated branch name
        await db
          .update(tasks)
          .set({
            branchName: aiBranchName,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))

        await logger.success('Generated AI branch name')
      } catch (error) {
        console.error('Error generating AI branch name:', error)

        // Fallback to timestamp-based branch name
        const fallbackBranchName = createFallbackBranchName(taskId)

        try {
          await db
            .update(tasks)
            .set({
              branchName: fallbackBranchName,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))

          const logger = createTaskLogger(taskId)
          await logger.info('Using fallback branch name')
        } catch (dbError) {
          console.error('Error updating task with fallback branch name:', dbError)
        }
      }
    })

    // Generate AI title after response is sent (non-blocking)
    after(async () => {
      try {
        // Check if AI Gateway API key is available
        if (!process.env.AI_GATEWAY_API_KEY) {
          console.log('AI_GATEWAY_API_KEY not available, skipping AI title generation')
          return
        }

        // Extract repository name from URL for context
        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        // Generate AI title
        const aiTitle = await generateTaskTitle({
          prompt: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        // Update task with AI-generated title
        await db
          .update(tasks)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
      } catch (error) {
        console.error('Error generating AI title:', error)

        // Fallback to truncated prompt
        const fallbackTitle = createFallbackTitle(validatedData.prompt)

        try {
          await db
            .update(tasks)
            .set({
              title: fallbackTitle,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        } catch (dbError) {
          console.error('Error updating task with fallback title:', dbError)
        }
      }
    })

    // Get user's API keys, GitHub token, and GitHub user info BEFORE entering after() block (where session is not accessible)
    const userApiKeys = await getUserApiKeys()
    const userGithubToken = await getUserGitHubToken()
    const githubUser = await getGitHubUser()
    // Get max sandbox duration for this user (user-specific > global > env var)
    const maxSandboxDuration = await getMaxSandboxDuration(session.user.id)

    // Process the task asynchronously with timeout
    // CRITICAL: Wrap in after() to ensure Vercel doesn't kill the function after response
    // Without this, serverless functions terminate immediately after sending the response
    after(async () => {
      try {
        await processTaskWithTimeout(
          session.user.id,
          newTask.id,
          validatedData.prompt,
          validatedData.repoUrl || '',
          validatedData.maxDuration || maxSandboxDuration,
          validatedData.selectedAgent || 'claude',
          validatedData.selectedModel,
          validatedData.installDependencies || false,
          validatedData.keepAlive || false,
          validatedData.enableBrowser || false,
          userApiKeys,
          userGithubToken,
          githubUser,
        )
      } catch (error) {
        console.error('Task processing failed:', error)
        // Error handling is already done inside processTaskWithTimeout
      }
    })

    return NextResponse.json({ task: newTask })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

async function processTaskWithTimeout(
  userId: string,
  taskId: string,
  prompt: string,
  repoUrl: string,
  maxDuration: number,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  keepAlive: boolean = false,
  enableBrowser: boolean = false,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
  githubToken?: string | null,
  githubUser?: {
    username: string
    name: string | null
    email: string | null
  } | null,
) {
  const TASK_TIMEOUT_MS = maxDuration * 60 * 1000 // Convert minutes to milliseconds

  // Add a warning 1 minute before timeout
  const warningTimeMs = Math.max(TASK_TIMEOUT_MS - 60 * 1000, 0)
  const warningTimeout = setTimeout(async () => {
    try {
      const warningLogger = createTaskLogger(taskId)
      await warningLogger.info('Task is approaching timeout, will complete soon')
    } catch (error) {
      console.error('Failed to add timeout warning:', error)
    }
  }, warningTimeMs)

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Task execution timed out after ${maxDuration} minutes`))
    }, TASK_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      processTask(
        userId,
        taskId,
        prompt,
        repoUrl,
        maxDuration,
        selectedAgent,
        selectedModel,
        installDependencies,
        keepAlive,
        enableBrowser,
        apiKeys,
        githubToken,
        githubUser,
      ),
      timeoutPromise,
    ])

    // Clear the warning timeout if task completes successfully
    clearTimeout(warningTimeout)
  } catch (error: unknown) {
    // Clear the warning timeout on any error
    clearTimeout(warningTimeout)
    // Handle timeout specifically
    if (error instanceof Error && error.message?.includes('timed out after')) {
      console.error('Task timed out:', taskId)

      // Use logger for timeout error
      const timeoutLogger = createTaskLogger(taskId)
      await timeoutLogger.error('Task execution timed out')
      await timeoutLogger.updateStatus('error', 'Task execution timed out. The operation took too long to complete.')
    } else {
      // Re-throw other errors to be handled by the original error handler
      throw error
    }
  }
}

// Helper function to wait for AI-generated branch name
async function waitForBranchName(taskId: string, maxWaitMs: number = 10000): Promise<string | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
      if (task?.branchName) {
        return task.branchName
      }
    } catch (error) {
      console.error('Error checking for branch name:', error)
    }

    // Wait 500ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return null
}

// Helper function to check if task was stopped
async function isTaskStopped(taskId: string): Promise<boolean> {
  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return task?.status === 'stopped'
  } catch (error) {
    console.error('Error checking task status:', error)
    return false
  }
}

async function processTask(
  userId: string,
  taskId: string,
  prompt: string,
  repoUrl: string,
  maxDuration: number,
  selectedAgent: string = 'claude',
  selectedModel?: string,
  installDependencies: boolean = false,
  keepAlive: boolean = false,
  enableBrowser: boolean = false,
  apiKeys?: {
    OPENAI_API_KEY?: string
    GEMINI_API_KEY?: string
    CURSOR_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    AI_GATEWAY_API_KEY?: string
  },
  githubToken?: string | null,
  githubUser?: {
    username: string
    name: string | null
    email: string | null
  } | null,
) {
  let sandbox: Sandbox | null = null
  const logger = createTaskLogger(taskId)
  const taskStartTime = Date.now()

  try {
    console.log('Starting task processing')

    // Update task status to processing with real-time logging
    await logger.updateStatus('processing', 'Task created, preparing to start...')
    await logger.updateProgress(10, 'Initializing task execution...')

    // Save the user's message
    try {
      await db.insert(taskMessages).values({
        id: generateId(12),
        taskId,
        role: 'user',
        content: prompt,
      })
    } catch (error) {
      console.error('Failed to save user message:', error)
    }

    // GitHub token and API keys are passed as parameters (retrieved before entering after() block)
    if (githubToken) {
      await logger.info('Using authenticated GitHub access')
    }
    await logger.info('API keys configured for selected agent')

    // Check if task was stopped before we even start
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before execution began')
      return
    }

    // Wait for AI-generated branch name (with timeout)
    const aiBranchName = await waitForBranchName(taskId, 10000)

    // Check if task was stopped during branch name generation
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during branch name generation')
      return
    }

    if (aiBranchName) {
      await logger.info('Using AI-generated branch name')
    } else {
      await logger.info('AI branch name not ready, will use fallback during sandbox creation')
    }

    await logger.updateProgress(15, 'Creating sandbox environment')
    console.log('Creating sandbox')

    // Detect the appropriate port for the project
    const port = await detectPortFromRepo(repoUrl, githubToken)
    console.log(`Detected port ${port} for project`)

    // Create sandbox with progress callback and 5-minute timeout
    const sandboxResult = await createSandbox(
      {
        taskId,
        repoUrl,
        githubToken,
        gitAuthorName: githubUser?.name || githubUser?.username || 'Coding Agent',
        gitAuthorEmail: githubUser?.username ? `${githubUser.username}@users.noreply.github.com` : 'agent@example.com',
        apiKeys,
        timeout: `${maxDuration}m`,
        ports: [port],
        runtime: 'node22',
        resources: { vcpus: 4 },
        taskPrompt: prompt,
        selectedAgent,
        selectedModel,
        installDependencies,
        keepAlive,
        enableBrowser,
        preDeterminedBranchName: aiBranchName || undefined,
        onProgress: async (progress: number, message: string) => {
          // Use real-time logger for progress updates
          await logger.updateProgress(progress, message)
        },
        onCancellationCheck: async () => {
          // Check if task was stopped
          return await isTaskStopped(taskId)
        },
      },
      logger,
    )

    if (!sandboxResult.success) {
      if (sandboxResult.cancelled) {
        // Task was cancelled, this should result in stopped status, not error
        await logger.info('Task was cancelled during sandbox creation')
        return
      }
      throw new Error(sandboxResult.error || 'Failed to create sandbox')
    }

    // Check if task was stopped during sandbox creation
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped during sandbox creation')
      // Clean up sandbox if it was created
      if (sandboxResult.sandbox) {
        try {
          await shutdownSandbox(sandboxResult.sandbox)
        } catch (error) {
          console.error('Failed to cleanup sandbox after stop:', error)
        }
      }
      return
    }

    const { sandbox: createdSandbox, domain, branchName } = sandboxResult
    sandbox = createdSandbox || null
    console.log('Sandbox created successfully')

    // Update sandbox URL, sandbox ID, and branch name (only update branch name if not already set by AI)
    const updateData: { sandboxUrl?: string; sandboxId?: string; updatedAt: Date; branchName?: string } = {
      sandboxId: sandbox?.sandboxId || undefined,
      sandboxUrl: domain || undefined,
      updatedAt: new Date(),
    }

    // Only update branch name if we don't already have an AI-generated one
    if (!aiBranchName) {
      updateData.branchName = branchName
    }

    await db.update(tasks).set(updateData).where(eq(tasks.id, taskId))

    // Check if task was stopped before agent execution
    if (await isTaskStopped(taskId)) {
      await logger.info('Task was stopped before agent execution')
      return
    }

    // Log agent execution start
    await logger.updateProgress(50, 'Installing and executing agent')
    console.log('Starting agent execution')

    if (!sandbox) {
      throw new Error('Sandbox is not available for agent execution')
    }

    type Connector = typeof connectors.$inferSelect

    let mcpServers: Connector[] = []

    try {
      // Get current user session to filter connectors
      const session = await getServerSession()

      if (session?.user?.id) {
        const userConnectors = await db
          .select()
          .from(connectors)
          .where(and(eq(connectors.userId, session.user.id), eq(connectors.status, 'connected')))

        mcpServers = userConnectors.map((connector: Connector) => {
          // Decrypt sensitive fields
          const decryptedEnv = connector.env ? JSON.parse(decrypt(connector.env)) : null
          return {
            ...connector,
            env: decryptedEnv,
            oauthClientSecret: connector.oauthClientSecret ? decrypt(connector.oauthClientSecret) : null,
          }
        })

        if (mcpServers.length > 0) {
          await logger.info('Found connected MCP servers')

          // Store MCP server IDs in the task
          await db
            .update(tasks)
            .set({
              mcpServerIds: JSON.parse(JSON.stringify(mcpServers.map((s) => s.id))),
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        } else {
          await logger.info('No connected MCP servers found for current user')
        }
      } else {
        await logger.info('No user session found, continuing without MCP servers')
      }
    } catch (mcpError) {
      console.error('Failed to fetch MCP servers:', mcpError)
      await logger.info('Warning: Could not fetch MCP servers, continuing without them')
    }

    // Sanitize prompt to prevent CLI option parsing issues
    const sanitizedPrompt = prompt
      .replace(/`/g, "'") // Replace backticks with single quotes
      .replace(/\$/g, '') // Remove dollar signs
      .replace(/\\/g, '') // Remove backslashes
      .replace(/^-/gm, ' -') // Prefix lines starting with dash to avoid CLI option parsing

    // === ORCHESTRATOR SUB-AGENT LOGIC ===
    let finalPrompt = sanitizedPrompt
    let isAwaitingUserInput = false

    // Generate agent message ID for streaming updates
    const agentMessageId = generateId()

    // Let us first define sub-tasks by the orchestrator
    await logger.info('Orchestrator evaluating task for sub-tasks...')
    const orchestratorModel = getModelClient(selectedModel || 'gpt-4o-mini')

    let agentResult: any = null

    try {
      // We use the orchestrator to break down the task
      const taskBreakdownPrompt = `
      Break down the following user request into logical sub-tasks.
      Return ONLY a JSON array of objects, where each object has:
      - id: A unique string ID for the sub-task (e.g. "task_1", "task_setup").
      - title: A short title.
      - description: A detailed description of what needs to be done.

      User Request:
      ${finalPrompt}
      `

      const { text: subTasksJsonText } = await generateText({
        model: orchestratorModel,
        system:
          'You are the Orchestrator Agent. Your job is to break down tasks into sub-tasks and output valid JSON. You maintain an internal state machine (todo-list). Keep sub-tasks highly independent so if one pauses for user input, others can proceed.',
        prompt: taskBreakdownPrompt,
      })

      try {
        let parsedText = subTasksJsonText.trim()
        if (parsedText.startsWith('```json')) {
          parsedText = parsedText.replace(/^```json\n?/, '').replace(/\n?```$/, '')
        }
        const parsedSubTasks = JSON.parse(parsedText)
        const subTasksWithStatus = parsedSubTasks.map((t: any) => ({ ...t, status: 'pending' }))

        // Save to DB
        await db
          .update(tasks)
          .set({
            subTasks: subTasksWithStatus,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))

        await logger.info(`Created ${subTasksWithStatus.length} sub-tasks.`)

        // For now, we simply pass the full prompt to the agent, but we could make it iterative
        // Since we are refactoring the Orchestrator to run as a persistent Main Agent Loop in the NEXT step (multi-tasking),
        // we will implement the while loop that iterates over these sub-tasks.
      } catch (parseError) {
        console.error('Failed to parse sub-tasks JSON:', parseError)
        await logger.info('Failed to parse sub-tasks, proceeding as single task.')
      }
    } catch (orchError) {
      console.error('Orchestrator sub-task generation failed:', orchError)
    }

    // === END ORCHESTRATOR SUB-TASK CREATION ===

    // We will retrieve subtasks from the DB and iterate through them
    let currentSubTasks = []
    try {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
      if (task?.subTasks) {
        currentSubTasks = task.subTasks as any[]
      }
    } catch (e) {
      console.error('Failed to get subtasks', e)
    }

    if (currentSubTasks.length === 0) {
      // Fallback
      agentResult = await executeAgentInSandbox(
        sandbox,
        finalPrompt,
        selectedAgent as AgentType,
        logger,
        selectedModel,
        mcpServers,
        undefined,
        apiKeys,
        undefined, // isResumed
        undefined, // sessionId
        taskId, // taskId for streaming updates
        agentMessageId, // agentMessageId for streaming updates
      )
    } else {
      for (let i = 0; i < currentSubTasks.length; i++) {
        const subTask = currentSubTasks[i]

        if (subTask.status === 'completed' || subTask.status === 'error') {
          continue // skip finished
        }

        if (subTask.status === 'awaiting_user_input') {
          // In the real full loop, we would yield here, but let us assume for this pass
          // we pause and return? Actually we should skip to the NEXT independent task
          // But for simplicity, we just mark task as awaiting_user_input and break.
          // Wait, the instructions say:
          // "Instruct the Orchestrator that when a sub-task hits an askUserClarification tool call,
          // that sub-agent pushes its current state to a paused queue and yields. The Orchestrator
          // then loops to the next independent task item using sequential loop iteration rather than
          // complex Promise.all concurrency, to prevent race conditions inside the Vercel Sandbox."
          continue
        }

        // Mark as processing
        currentSubTasks[i].status = 'processing'
        await db.update(tasks).set({ subTasks: currentSubTasks, updatedAt: new Date() }).where(eq(tasks.id, taskId))
        await logger.info(`Starting sub-task: ${subTask.title}`)

        // Run the agent on this specific sub-task
        const subPrompt = `
        Original request: ${finalPrompt}

        Your specific sub-task:
        Title: ${subTask.title}
        Description: ${subTask.description}

        TOOLS INSTRUCTION:
        1. If you need to ask the user a clarifying question before you can proceed, output EXACTLY the following string format and nothing else:
        [ASK_USER]: <your question here>

        2. To execute sandbox commands (e.g., npm install, running scripts), use your built-in Bash tool.

        3. To author or edit dynamic tool scripts inside the sandbox, use your built-in Edit/Write tool.

        Focus ONLY on completing this sub-task.
        `

        agentResult = await executeAgentInSandbox(
          sandbox,
          subPrompt,
          selectedAgent as AgentType,
          logger,
          selectedModel,
          mcpServers,
          undefined,
          apiKeys,
          undefined,
          undefined,
          taskId,
          generateId(),
        )

        // Right after execution, we would normally check if the agent triggered askUserClarification
        // and update its status. We will simulate that for now.
        if (agentResult?.success) {
          // Check if it outputted the [ASK_USER] token
          if (agentResult.agentResponse && agentResult.agentResponse.includes('[ASK_USER]:')) {
            currentSubTasks[i].status = 'awaiting_user_input'

            // Extract the question
            const match = agentResult.agentResponse.match(/\[ASK_USER\]:([\s\S]*)/)
            const question = match ? match[1].trim() : 'I need some clarification to proceed.'

            // Add question to taskMessages
            await db.insert(taskMessages).values({
              id: generateId(12),
              taskId,
              role: 'agent',
              content: question,
            })

            await db
              .update(tasks)
              .set({
                status: 'awaiting_user_input',
                subTasks: currentSubTasks,
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, taskId))
          } else {
            currentSubTasks[i].status = 'completed'
            await db.update(tasks).set({ subTasks: currentSubTasks, updatedAt: new Date() }).where(eq(tasks.id, taskId))
          }
        } else {
          // Wait, what if it was marked as awaiting_user_input internally?
          // We will handle that by checking the DB or the agentResult
          // For now, let us just mark as error if it fails
          if (agentResult.error === 'Awaiting user input') {
            currentSubTasks[i].status = 'awaiting_user_input'
          } else {
            currentSubTasks[i].status = 'error'
          }
          await db.update(tasks).set({ subTasks: currentSubTasks, updatedAt: new Date() }).where(eq(tasks.id, taskId))
          break // Stop on error
        }
      }
    }
    console.log('Agent execution completed')

    // Update agent session ID if provided (for Cursor agent resumption)
    if (agentResult?.sessionId) {
      await db.update(tasks).set({ agentSessionId: agentResult.sessionId }).where(eq(tasks.id, taskId))
    }

    if (agentResult?.success) {
      // Log agent completion
      await logger.success('Agent execution completed')
      await logger.info('Code changes applied successfully')

      if (agentResult.agentResponse) {
        await logger.info('Agent response received')

        // Save the agent's response message
        try {
          await db.insert(taskMessages).values({
            id: generateId(12),
            taskId,
            role: 'agent',
            content: agentResult.agentResponse,
          })
        } catch (error) {
          console.error('Failed to save agent message:', error)
        }
      }

      // Agent execution logs are already logged in real-time by the agent
      // No need to log them again here

      // Generate AI-powered commit message
      let commitMessage: string
      try {
        // Extract repository name from URL for context
        let repoName: string | undefined
        try {
          const url = new URL(repoUrl)
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        if (process.env.AI_GATEWAY_API_KEY) {
          commitMessage = await generateCommitMessage({
            description: prompt,
            repoName,
            context: `${selectedAgent} agent task`,
          })
        } else {
          commitMessage = createFallbackCommitMessage(prompt)
        }
      } catch (error) {
        console.error('Error generating commit message:', error)
        commitMessage = createFallbackCommitMessage(prompt)
      }

      // Push changes to branch
      const pushResult = await pushChangesToBranch(sandbox!, branchName!, commitMessage, logger)

      // Conditionally shutdown sandbox based on keepAlive setting
      if (keepAlive) {
        // Keep sandbox alive for follow-up messages
        await logger.info('Sandbox kept alive for follow-up messages')
        // Dev server is already started during sandbox creation if installDependencies was true
        // No need to start it again here
      } else {
        // Unregister and shutdown sandbox
        unregisterSandbox(taskId)
        const shutdownResult = await shutdownSandbox(sandbox!)
        if (shutdownResult.success) {
          await logger.success('Sandbox shutdown completed')
        } else {
          await logger.error('Sandbox shutdown failed')
        }
      }

      // Check if push failed and handle accordingly
      if (pushResult.pushFailed) {
        await logger.updateStatus('error')
        await logger.error('Task failed: Unable to push changes to repository')
        throw new Error('Failed to push changes to repository')
      } else {
        // Update task as completed
        await logger.updateStatus('completed')
        await logger.updateProgress(100, 'Task completed successfully')
        // Store long-term memory asynchronously
        after(async () => {
          await summarizeAndStoreTask(userId, taskId, prompt, agentResult.agentResponse || null)
        })

        console.log('Task completed successfully')
      }
    } else {
      // Agent failed, but we still want to capture its logs
      await logger.error('Agent execution failed')

      // Agent execution logs are already logged in real-time by the agent
      // No need to log them again here

      throw new Error(agentResult?.error || 'Agent execution failed')
    }
  } catch (error) {
    console.error('Error processing task:', error)

    // Try to shutdown sandbox even on error (unless keepAlive is enabled)
    if (sandbox) {
      try {
        if (keepAlive) {
          // Keep sandbox alive even on error for potential retry
          await logger.info('Sandbox kept alive despite error')
        } else {
          unregisterSandbox(taskId)
          const shutdownResult = await shutdownSandbox(sandbox)
          if (shutdownResult.success) {
            await logger.info('Sandbox shutdown completed after error')
          } else {
            await logger.error('Sandbox shutdown failed')
          }
        }
      } catch (shutdownError) {
        console.error('Failed to shutdown sandbox after error:', shutdownError)
        await logger.error('Failed to shutdown sandbox after error')
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    // Log the error and update task status
    await logger.error('Error occurred during task processing')
    await logger.updateStatus('error', errorMessage)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required' }, { status: 400 })
    }

    const actions = action.split(',').map((a) => a.trim())
    const validActions = ['completed', 'failed', 'stopped']
    const invalidActions = actions.filter((a) => !validActions.includes(a))

    if (invalidActions.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid action(s): ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}`,
        },
        { status: 400 },
      )
    }

    // Build the where conditions for task status
    const statusConditions = []
    if (actions.includes('completed')) {
      statusConditions.push(eq(tasks.status, 'completed'))
    }
    if (actions.includes('failed')) {
      statusConditions.push(eq(tasks.status, 'error'))
    }
    if (actions.includes('stopped')) {
      statusConditions.push(eq(tasks.status, 'stopped'))
    }

    if (statusConditions.length === 0) {
      return NextResponse.json({ error: 'No valid actions specified' }, { status: 400 })
    }

    // Delete tasks based on conditions AND user ownership
    const statusClause = statusConditions.length === 1 ? statusConditions[0] : or(...statusConditions)
    const whereClause = and(statusClause, eq(tasks.userId, session.user.id))
    const deletedTasks = await db.delete(tasks).where(whereClause).returning()

    // Build response message
    const actionMessages = []
    if (actions.includes('completed')) {
      const completedCount = deletedTasks.filter((task) => task.status === 'completed').length
      if (completedCount > 0) actionMessages.push(`${completedCount} completed`)
    }
    if (actions.includes('failed')) {
      const failedCount = deletedTasks.filter((task) => task.status === 'error').length
      if (failedCount > 0) actionMessages.push(`${failedCount} failed`)
    }
    if (actions.includes('stopped')) {
      const stoppedCount = deletedTasks.filter((task) => task.status === 'stopped').length
      if (stoppedCount > 0) actionMessages.push(`${stoppedCount} stopped`)
    }

    const message =
      actionMessages.length > 0
        ? `${actionMessages.join(' and ')} task(s) deleted successfully`
        : 'No tasks found to delete'

    return NextResponse.json({
      message,
      deletedCount: deletedTasks.length,
    })
  } catch (error) {
    console.error('Error deleting tasks:', error)
    return NextResponse.json({ error: 'Failed to delete tasks' }, { status: 500 })
  }
}
