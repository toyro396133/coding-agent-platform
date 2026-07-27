import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext, PlanStep } from './types'

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function createPlanTools(ctx: ToolContext) {
  const steps: PlanStep[] = []
  let currentPlan = ''

  return {
    createPlan: tool({
      description:
        'Create a structured, step-by-step plan for accomplishing a task. Use this before making changes to complex tasks.',
      inputSchema: z.object({
        objective: z.string().describe('The goal or task to plan for'),
        constraints: z.string().optional().describe('Any constraints, preferences, or requirements'),
        steps: z
          .array(
            z.object({
              description: z.string().describe('What this step does'),
              dependsOn: z.array(z.string()).optional().describe('IDs of steps this depends on'),
            }),
          )
          .describe('The ordered list of steps to accomplish the objective'),
      }),
      execute: async ({ objective, constraints, steps: inputSteps }) => {
        steps.length = 0
        inputSteps.forEach((s, i) => {
          const id = `step-${i + 1}`
          steps.push({
            id,
            description: s.description,
            status: 'pending',
            dependsOn: s.dependsOn || [],
          })
        })
        currentPlan =
          `## Plan: ${objective}\n\n${constraints ? `Constraints: ${constraints}\n\n` : ''}` +
          steps
            .map(
              (s) =>
                `${s.id}: ${s.description} [${s.status}]${s.dependsOn.length ? ` (depends on: ${s.dependsOn.join(', ')})` : ''}`,
            )
            .join('\n')
        return currentPlan
      },
    }),

    presentPlan: tool({
      description: 'Present the current plan for review. Shows all steps and their status.',
      inputSchema: z.object({}),
      execute: async () => {
        if (steps.length === 0) return 'No plan has been created yet. Use createPlan first.'
        return currentPlan
      },
    }),

    approveStep: tool({
      description: 'Mark a specific step as approved and ready for execution.',
      inputSchema: z.object({
        stepId: z.string().describe('The ID of the step to approve (e.g., "step-1")'),
      }),
      execute: async ({ stepId }) => {
        const step = steps.find((s) => s.id === stepId)
        if (!step) {
          return `Error: Step "${stepId}" not found. Available steps: ${steps.map((s) => s.id).join(', ')}`
        }
        if (step.dependsOn.includes(stepId)) {
          return `Error: Step "${stepId}" cannot depend on itself`
        }
        const missingDeps = step.dependsOn.filter((depId) => !steps.find((s) => s.id === depId))
        if (missingDeps.length > 0) {
          return `Error: Step "${stepId}" has missing dependencies: ${missingDeps.join(', ')}`
        }
        const visited = new Set<string>()
        const checkCycle = (id: string): boolean => {
          if (visited.has(id)) return true
          visited.add(id)
          const currentStep = steps.find((s) => s.id === id)
          if (!currentStep) return false
          for (const depId of currentStep.dependsOn) {
            if (checkCycle(depId)) return true
          }
          visited.delete(id)
          return false
        }
        if (checkCycle(stepId)) {
          return `Error: Circular dependency detected in step "${stepId}"`
        }
        const unapprovedDeps = step.dependsOn.filter((depId) => {
          const dep = steps.find((s) => s.id === depId)
          return dep && dep.status !== 'approved' && dep.status !== 'completed'
        })
        if (unapprovedDeps.length > 0) {
          return `Cannot approve "${stepId}" — dependencies not yet approved: ${unapprovedDeps.join(', ')}`
        }
        step.status = 'approved'
        return `Step "${stepId}" approved.`
      },
    }),

    revisePlan: tool({
      description: 'Update the plan based on new information or feedback. Can add, remove, or modify steps.',
      inputSchema: z.object({
        feedback: z.string().describe('What should change and why'),
        updatedSteps: z
          .array(
            z.object({
              description: z.string().describe('What this step does'),
              dependsOn: z.array(z.string()).optional().describe('IDs of steps this depends on'),
            }),
          )
          .describe('The updated list of steps'),
      }),
      execute: async ({ feedback, updatedSteps }) => {
        const completedIds = steps.filter((s) => s.status === 'completed').map((s) => s.id)
        steps.length = 0
        updatedSteps.forEach((s, i) => {
          const id = `step-${i + 1}`
          steps.push({
            id,
            description: s.description,
            status: completedIds.includes(id) ? 'completed' : 'pending',
            dependsOn: s.dependsOn || [],
          })
        })
        currentPlan =
          `## Revised Plan\n\nFeedback incorporated: ${feedback}\n\n` +
          steps.map((s) => `${s.id}: ${s.description} [${s.status}]`).join('\n')
        return currentPlan
      },
    }),
  }
}
