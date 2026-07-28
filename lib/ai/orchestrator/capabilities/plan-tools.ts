import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { taskPlans, tasks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import * as crypto from 'crypto'
import type { ToolContext, PlanStep } from './types'

export function createPlanTools(ctx: ToolContext) {
  return {
    createPlan: tool({
      description:
        'Create a structured, step-by-step plan for accomplishing a task and submit it for user approval. Use this for human-in-the-loop planning.',
      inputSchema: z.object({
        objective: z.string().describe('The goal or task to plan for'),
        steps: z
          .array(
            z.object({
              description: z.string().describe('What this step does'),
              dependencies: z.array(z.string()).optional().describe('IDs of steps this depends on'),
            }),
          )
          .describe('The ordered list of steps to accomplish the objective'),
      }),
      execute: async ({ objective, steps }) => {
        try {
          const planContent = { objective, steps }
          const planString = JSON.stringify(planContent)
          const hash = crypto.createHash('sha256').update(planString).digest('hex')

          // Check if a plan already exists to increment version
          const existingPlans = await db
            .select({ version: taskPlans.version })
            .from(taskPlans)
            .where(eq(taskPlans.taskId, ctx.taskId))
            .orderBy(taskPlans.version)

          const nextVersion = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].version + 1 : 1

          await db.insert(taskPlans).values({
            taskId: ctx.taskId,
            planContent,
            hash,
            version: nextVersion,
            status: 'pending_approval',
          })

          await db.update(tasks).set({ status: 'PLANNING_PENDING_APPROVAL' }).where(eq(tasks.id, ctx.taskId))

          return `Plan submitted for user approval with version ${nextVersion}. The task is now paused until the user approves this plan.`
        } catch (error: any) {
          return `Failed to create plan: ${error.message}`
        }
      },
    }),
  }
}
