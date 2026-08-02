import { generateObject } from 'ai'
import { z } from 'zod'
import { getModelClient } from './models'

export type TaskComplexity = 1 | 2 | 3 | 4 | 5

export interface RoutingDecision {
  complexity: TaskComplexity
  model: string
  reasoning: string
}

const complexitySchema = z.object({
  complexity: z.number().int().min(1).max(5).describe('The complexity of the task on a scale from 1 to 5.'),
  reasoning: z.string().describe('A brief explanation for the assigned complexity score.'),
})

/**
 * Analyzes the prompt and determines the task complexity score.
 * Uses a fast and cheap model (e.g., gpt-4o-mini) to classify the request.
 */
export async function analyzePromptComplexity(
  prompt: string,
): Promise<{ complexity: TaskComplexity; reasoning: string }> {
  try {
    const fastModel = getModelClient('gpt-4o-mini')

    const { object } = await generateObject({
      model: fastModel,
      schema: complexitySchema,
      prompt: `Analyze the complexity of the following software engineering task prompt.

      Score 1-2: Simple tasks (e.g., adding comments, updating package versions, fixing minor typos, simple documentation).
      Score 3: Moderate tasks (e.g., adding a simple function, fixing a straightforward logic bug).
      Score 4: Complex tasks (e.g., building a new UI component, implementing a new API endpoint).
      Score 5: Highly complex tasks (e.g., architectural changes, full feature implementation, complex refactoring).

      Prompt:
      "${prompt}"
      `,
    })

    return {
      complexity: object.complexity as TaskComplexity,
      reasoning: object.reasoning,
    }
  } catch (_error) {
    console.error('Failed to analyze prompt complexity, defaulting to level 3')
    return {
      complexity: 3,
      reasoning: 'Fallback complexity due to analysis failure.',
    }
  }
}

/**
 * Routes the prompt to the most appropriate model based on its complexity.
 * Optionally respects agent type to ensure model compatibility.
 *
 * NOTE (ADR-0001): this is the LLM-based strategy. The canonical sync
 * `routePrompt` lives in `lib/ai/router.ts`; this function was renamed to
 * `routePromptWithLLM` so the two strategies can never collide by name.
 */
export async function routePromptWithLLM(prompt: string, agentType?: string): Promise<RoutingDecision> {
  const analysis = await analyzePromptComplexity(prompt)

  let recommendedModel = 'gpt-4o-mini' // Default to cheap model

  // Provider-aware model selection
  if (agentType === 'claude') {
    // Claude agent should only use Claude models
    if (analysis.complexity >= 4) {
      recommendedModel = 'claude-3-5-sonnet-20241022'
    } else if (analysis.complexity === 3) {
      recommendedModel = 'claude-3-5-sonnet-20241022'
    } else {
      recommendedModel = 'claude-3-5-haiku'
    }
  } else if (agentType === 'gemini') {
    // Gemini agent should only use Gemini models
    if (analysis.complexity >= 4) {
      recommendedModel = 'gemini-2.5-pro'
    } else if (analysis.complexity === 3) {
      recommendedModel = 'gemini-2.5-flash'
    } else {
      recommendedModel = 'gemini-2.5-flash'
    }
  } else {
    // For other agents (codex, copilot, cursor, opencode) or when agentType is not specified,
    // use OpenAI models as they are widely compatible
    if (analysis.complexity >= 4) {
      recommendedModel = 'claude-3-5-sonnet-20241022' // Elite model for high complexity
    } else if (analysis.complexity === 3) {
      recommendedModel = 'gpt-4o' // Middle ground
    } else {
      recommendedModel = 'gpt-4o-mini'
    }
  }

  return {
    ...analysis,
    model: recommendedModel,
  }
}
