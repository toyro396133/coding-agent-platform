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
  complexity: z.number().min(1).max(5).describe('The complexity of the task on a scale from 1 to 5.'),
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
  } catch (error) {
    console.error('Failed to analyze prompt complexity, defaulting to level 3:', error)
    return {
      complexity: 3,
      reasoning: 'Fallback complexity due to analysis failure.',
    }
  }
}

/**
 * Routes the prompt to the most appropriate model based on its complexity.
 */
export async function routePrompt(prompt: string): Promise<RoutingDecision> {
  const analysis = await analyzePromptComplexity(prompt)

  let recommendedModel = 'gpt-4o-mini' // Default to cheap model

  if (analysis.complexity >= 4) {
    recommendedModel = 'claude-3-5-sonnet-20241022' // Assuming this is the elite model we want to use for 4-5
  } else if (analysis.complexity === 3) {
    recommendedModel = 'gpt-4o' // Middle ground
  } else {
    // 1-2
    recommendedModel = 'gpt-4o-mini'
  }

  return {
    ...analysis,
    model: recommendedModel,
  }
}
