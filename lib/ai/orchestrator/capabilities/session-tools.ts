import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext, Checkpoint } from './types'

export function createSessionTools(ctx: ToolContext) {
  const checkpoints: Checkpoint[] = []
  let forkCount = 0

  return {
    checkpoint: tool({
      description:
        'Save the current state as a checkpoint that can be restored later. Use before making risky changes.',
      inputSchema: z.object({
        label: z.string().optional().describe('A human-readable label for this checkpoint'),
      }),
      execute: async ({ label }) => {
        const id = `ck-${Date.now().toString(36)}`
        checkpoints.push({
          id,
          label: label || `Checkpoint ${checkpoints.length + 1}`,
          timestamp: new Date(),
          context: ctx.accumulatedContext.slice(-2000),
          subAgentResults: ctx.subAgentResults.slice(-10),
        })
        return `Checkpoint "${label || id}" saved. Use restore with id "${id}" to return to this state.`
      },
    }),

    restore: tool({
      description: 'Restore to a previous checkpoint. Use this to undo changes or explore alternative approaches.',
      inputSchema: z.object({
        checkpointId: z.string().describe('The checkpoint ID to restore'),
      }),
      execute: async ({ checkpointId }) => {
        const ck = checkpoints.find((c) => c.id === checkpointId)
        if (!ck) {
          const available = checkpoints.map((c) => `${c.id}: ${c.label}`).join('\n')
          return `Checkpoint "${checkpointId}" not found.\nAvailable checkpoints:\n${available || 'No checkpoints saved yet.'}`
        }
        return `Restored to checkpoint "${ck.label}" (${ck.id}). Context from that point is available.`
      },
    }),

    getHistory: tool({
      description: 'View the execution history including all checkpoints and sub-agent results.',
      inputSchema: z.object({
        maxEntries: z.number().min(1).max(50).optional().default(10),
      }),
      execute: async ({ maxEntries }) => {
        const lines: string[] = ['## Execution History\n']
        if (checkpoints.length > 0) {
          lines.push('### Checkpoints:')
          checkpoints.slice(-maxEntries).forEach((ck) => {
            lines.push(`- ${ck.id}: ${ck.label} (${ck.timestamp.toISOString()})`)
          })
          lines.push('')
        }
        if (ctx.subAgentResults.length > 0) {
          lines.push('### Sub-Agent Results:')
          ctx.subAgentResults.slice(-maxEntries).forEach((r) => {
            lines.push(`- ${r.type}: ${r.prompt.slice(0, 100)}...`)
          })
        }
        if (lines.length === 1) return 'No history available yet.'
        return lines.join('\n')
      },
    }),

    fork: tool({
      description: 'Create a fork (branch) from the current session state. Returns a fork identifier that can be used to track separate exploration paths.',
      inputSchema: z.object({
        label: z.string().optional().describe('A label describing this fork'),
      }),
      execute: async ({ label }) => {
        forkCount++
        const forkId = `fork-${forkCount}-${Date.now().toString(36)}`
        checkpoints.push({
          id: forkId,
          label: label || `Fork ${forkCount}`,
          timestamp: new Date(),
          context: ctx.accumulatedContext.slice(-2000),
          subAgentResults: ctx.subAgentResults.slice(-10),
        })
        return `Fork "${label || forkId}" created with id "${forkId}". You are now on a new exploration path. Use restore with this id to return to this fork point.`
      },
    }),
  }
}
