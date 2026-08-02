import * as crypto from 'node:crypto'
import { tool } from 'ai'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { taskPlans, tasks } from '@/lib/db/schema'
import type { ToolContext } from './types'

export const planStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()).optional(),
})

export const planContentSchema = z.object({
  objective: z.string(),
  steps: z.array(planStepSchema),
})

export type PlanContent = z.infer<typeof planContentSchema>

export function createPlanTools(ctx: ToolContext) {
  // In FULL autonomy the plan is recorded for reference but never blocks
  // execution — the agent proceeds in the same pass. In guided/autonomous mode
  // it pauses for human approval (guided) or is optional (autonomous).
  const blocksExecution = ctx.autonomyLevel === 'guided'

  return {
    createPlan: tool({
      description: blocksExecution
        ? 'Create a structured, step-by-step plan for accomplishing a task and submit it for user approval. Use this for human-in-the-loop planning.'
        : 'Create a structured, step-by-step plan for accomplishing a task. The plan is recorded for reference; execution continues in the same pass (no approval pause).',
      inputSchema: z.object({
        objective: z.string().describe('The goal or task to plan for'),
        steps: z
          .array(
            z.object({
              id: z.string().describe('Unique identifier for this step'),
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

          await db.transaction(async (tx) => {
            // Check if a plan already exists to increment version
            const existingPlans = await tx
              .select({ version: taskPlans.version })
              .from(taskPlans)
              .where(eq(taskPlans.taskId, ctx.taskId))
              .orderBy(taskPlans.version)

            const nextVersion = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].version + 1 : 1

            await tx.insert(taskPlans).values({
              taskId: ctx.taskId,
              planContent,
              hash,
              version: nextVersion,
              status: 'pending_approval',
            })

            // Only pause for approval in guided mode. In full/autonomous the
            // agent keeps executing and the plan is just a recorded artifact.
            if (blocksExecution) {
              await tx.update(tasks).set({ status: 'PLANNING_PENDING_APPROVAL' }).where(eq(tasks.id, ctx.taskId))
            }
          })

          const existingPlans = await db
            .select({ version: taskPlans.version })
            .from(taskPlans)
            .where(eq(taskPlans.taskId, ctx.taskId))
            .orderBy(taskPlans.version)

          const insertedVersion = existingPlans.length > 0 ? existingPlans[existingPlans.length - 1].version : 1

          return blocksExecution
            ? `Plan submitted for user approval with version ${insertedVersion}. The task is now paused until the user approves this plan.`
            : `Plan recorded (version ${insertedVersion}). Continuing execution autonomously — no approval needed.`
        } catch (_error: any) {
          console.error('Failed to create plan')
          return `Failed to create plan. Please try again.`
        }
      },
    }),
  }
}
