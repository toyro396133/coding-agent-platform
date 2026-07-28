#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { chromium } from 'playwright-core'
import OpenAI from 'openai'

const server = new Server(
  {
    name: 'visual-qa-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

// We define a helper to wait for the page to be ready
async function captureScreenshot(url: string, timeoutMs: number = 30000): Promise<string> {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()

    // We add a small retry mechanism if connection is refused (meaning server is booting up)
    let success = false
    const startTime = Date.now()
    let lastError: Error | null = null

    while (Date.now() - startTime < timeoutMs) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 5000 })
        success = true
        break
      } catch (e: any) {
        lastError = e
        if (e.message && e.message.includes('ERR_CONNECTION_REFUSED')) {
          // Wait 1 second before retrying
          await new Promise((resolve) => setTimeout(resolve, 1000))
        } else {
          // Break on other errors (like DNS)
          break
        }
      }
    }

    if (!success) {
      throw new Error(`Failed to load ${url} after ${timeoutMs}ms. Last error: ${lastError?.message}`)
    }

    // Additional short wait for React/Next.js hydration and animations
    await page.waitForTimeout(1000)

    const buffer = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true })
    return buffer.toString('base64')
  } finally {
    await browser.close()
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'take_screenshot',
        description:
          'Captures a screenshot of a given URL and returns it as a Base64 string. Use this to manually inspect the UI.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to navigate to (e.g., http://localhost:3000)',
            },
            timeoutMs: {
              type: 'number',
              description: 'Timeout in milliseconds to wait for the page to load (default: 30000)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'visual_qa_critique',
        description:
          'Captures a screenshot of a URL and sends it to a Vision Model (GPT-4o) with a prompt. Returns textual critique and feedback.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to navigate to (e.g., http://localhost:3000)',
            },
            prompt: {
              type: 'string',
              description:
                "The questions or requirements to evaluate visually (e.g., 'Does the button have a red background? Is the text overlapping?')",
            },
          },
          required: ['url', 'prompt'],
        },
      },
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'take_screenshot') {
    const url = request.params.arguments?.url as string
    const timeoutMs = request.params.arguments?.timeoutMs as number | undefined

    try {
      const base64Image = await captureScreenshot(url, timeoutMs)
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot captured successfully for ${url}`,
          },
          {
            type: 'image',
            data: base64Image,
            mimeType: 'image/jpeg',
          },
        ],
      }
    } catch (e: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error taking screenshot: ${e.message}`,
          },
        ],
      }
    }
  }

  if (request.params.name === 'visual_qa_critique') {
    const url = request.params.arguments?.url as string
    const prompt = request.params.arguments?.prompt as string

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'OPENAI_API_KEY environment variable is not set. Cannot run visual QA.' }],
      }
    }

    try {
      const base64Image = await captureScreenshot(url)

      const openai = new OpenAI({ apiKey })
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      })

      const critique = response.choices[0].message.content || 'No response from model.'

      return {
        content: [
          {
            type: 'text',
            text: critique,
          },
        ],
      }
    } catch (e: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error performing visual QA: ${e.message}`,
          },
        ],
      }
    }
  }

  throw new Error('Tool not found')
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Visual QA MCP server running on stdio')
}

main().catch((error) => {
  console.error('Server error:', error)
  process.exit(1)
})
