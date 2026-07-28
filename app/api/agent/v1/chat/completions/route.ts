import { NextRequest, NextResponse, after } from 'next/server'
import { extractBearerToken, validatePlatformApiKey } from '@/lib/auth/api-key'
import { generateId } from '@/lib/utils/id'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { createFallbackTitle } from '@/lib/utils/title-generator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

/**
 * Initializes a background task from an OpenAI Chat Completions-compatible request.
 *
 * Authenticates the request, validates the user prompt and target repository, creates
 * a pending task, and dispatches it for background processing. Supports streaming and
 * non-streaming responses that include the task identifier and started status.
 *
 * @returns An OpenAI-compatible response containing the initialized task details, or
 * an error response when authentication, validation, or processing fails.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('authorization')
    const token = extractBearerToken(authHeader)

    if (!token) {
      return NextResponse.json(
        {
          error: { message: 'Missing Authorization header', type: 'invalid_request_error' },
        },
        { status: 401 },
      )
    }

    const userId = await validatePlatformApiKey(token)

    if (!userId) {
      return NextResponse.json(
        {
          error: { message: 'Invalid API key', type: 'invalid_request_error' },
        },
        { status: 401 },
      )
    }

    // 2. Parse OpenAI Payload
    let body: any
    try {
      body = await req.json()
    } catch (error) {
      return NextResponse.json(
        {
          error: { message: 'Invalid JSON in request body', type: 'invalid_request_error' },
        },
        { status: 400 },
      )
    }

    const { messages, model, stream, platform_config, extra_body } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        {
          error: { message: 'Messages array is required', type: 'invalid_request_error' },
        },
        { status: 400 },
      )
    }

    // Get the last user message as the prompt
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || typeof lastMessage !== 'object' || lastMessage === null) {
      return NextResponse.json(
        {
          error: { message: 'Invalid message format', type: 'invalid_request_error' },
        },
        { status: 400 },
      )
    }

    if (lastMessage.role !== 'user') {
      return NextResponse.json(
        {
          error: { message: 'The last message must be from the user', type: 'invalid_request_error' },
        },
        { status: 400 },
      )
    }

    const prompt = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content)

    // Extract platform config (can be in extra_body or directly in root)
    const config = platform_config || (extra_body && extra_body.platform_config) || {}
    const { repoUrl, branchName, agentConfig } = config

    if (!repoUrl) {
      return NextResponse.json(
        {
          error: {
            message: 'Missing repoUrl in platform_config. This platform requires a target repository.',
            type: 'invalid_request_error',
          },
        },
        { status: 400 },
      )
    }

    // Validate repoUrl format and scheme
    const repoUrlSchema = z.string().url().refine(
      (url) => {
        try {
          const parsed = new URL(url)
          // Only allow https scheme
          if (parsed.protocol !== 'https:') {
            return false
          }
          // Restrict to approved repository hosts
          const allowedHosts = ['github.com', 'gitlab.com', 'bitbucket.org']
          return allowedHosts.includes(parsed.hostname)
        } catch {
          return false
        }
      },
      { message: 'Repository URL must be HTTPS and from an approved host (github.com, gitlab.com, bitbucket.org)' },
    )

    const repoUrlValidation = repoUrlSchema.safeParse(repoUrl)
    if (!repoUrlValidation.success) {
      return NextResponse.json(
        {
          error: {
            message: repoUrlValidation.error.issues[0]?.message || 'Invalid repository URL',
            type: 'invalid_request_error',
          },
        },
        { status: 400 },
      )
    }

    // 3. Create Task Record
    const taskId = generateId(12)
    const actualBranchName = branchName || createFallbackBranchName(taskId)
    const title = createFallbackTitle(prompt)

    // Default agent configs or override from config
    const selectedAgent = agentConfig?.selectedAgent || 'claude'
    const keepAlive = agentConfig?.keepAlive ?? false

    await db.insert(tasks).values({
      id: taskId,
      userId,
      title,
      prompt: prompt,
      status: 'pending',
      repoUrl,
      branchName: actualBranchName,
      selectedAgent,
      keepAlive,

      agentSessionId: null,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Prepare internal payload to hand off to background orchestrator
    const orchestratorPayload = {
      prompt,
      repoUrl,
      branchName: actualBranchName,
      taskId,
      selectedAgent,
      keepAlive,
      installDependencies: true,
      executionMode: 'orchestrator_external',
      executionLevel: 'auto',
    }

    // Note: To prevent Vercel from timing out the request while the agent runs,
    // we would ideally dispatch this to a queue or edge function.
    // Since we're in Next.js, we trigger it but don't await the full agent run here,
    // OR if streaming is requested, we pipe the SSE.

    // Start the process in the background using the internal API
    const baseUrl = process.env.INTERNAL_API_BASE_URL
    const internalToken = process.env.INTERNAL_SYSTEM_TOKEN

    if (!baseUrl || !internalToken) {
      return NextResponse.json(
        {
          error: {
            message: 'Internal API configuration is missing',
            type: 'api_error',
          },
        },
        { status: 500 },
      )
    }

    // Use after() to ensure the task invocation continues after response is returned
    after(async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

        const response = await fetch(`${baseUrl}/api/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${internalToken}`,
          },
          body: JSON.stringify(orchestratorPayload),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error('Task invocation failed')
        }
      } catch (err) {
        // Update task to error status
        await db
          .update(tasks)
          .set({
            status: 'error',
            error: 'Failed to start background task processing',
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
        console.error('Background task invocation failed')
      }
    })

    // 4. Return OpenAI Compatible Response
    if (stream) {
      // In a full implementation, we'd establish SSE here and proxy events from the sandbox
      // For this phase, we'll return a simulated stream response indicating the job started
      const encoder = new TextEncoder()

      const streamObj = new ReadableStream({
        async start(controller) {
          // Send initial message
          const chunk = {
            id: `chatcmpl-${taskId}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'agent-router',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: `Task initialized with ID: ${taskId}. The agent is now working on your request in the background.`,
                },
                finish_reason: null,
              },
            ],
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))

          // Send configuration info as extra data (custom extension to OpenAI)
          const configChunk = {
            id: `chatcmpl-${taskId}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'agent-router',
            platform_job_id: taskId,
            platform_status: 'started',
            choices: [],
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(configChunk)}\n\n`))

          // Send done
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      return new Response(streamObj, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    } else {
      // Non-streaming response
      return NextResponse.json({
        id: `chatcmpl-${taskId}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'agent-router',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: `Task initialized with ID: ${taskId}. The agent is now working on your request in the background.`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
        // Platform specific metadata
        platform_metadata: {
          job_id: taskId,
          status: 'started',
        },
      })
    }
  } catch (error) {
    console.error('Error in OpenAI compatible endpoint')
    return NextResponse.json(
      {
        error: {
          message: 'Internal server error',
          type: 'api_error',
        },
      },
      { status: 500 },
    )
  }
}
