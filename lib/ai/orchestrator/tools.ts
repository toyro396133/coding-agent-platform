import { tool } from 'ai'
import { z } from 'zod'
import type { OrchestratorState } from './state'
import type { DaemonAgentSpec, DaemonAgentStatus } from './worker/types'
import { getDaemonAgentStatuses, spawnDaemonAgent, stopDaemonAgent } from './worker/worker-manager'

export function createOrchestratorTools(state: OrchestratorState) {
  return {
    spawnSubAgent: tool({
      description: 'Spawn a specialized sub-agent for a specific sub-task.',
      inputSchema: z.object({
        subTaskType: z.string().describe('Identifier for the sub-task (e.g., "css_specialist", "api_reader")'),
        prompt: z.string().describe('The specific assignment for this sub-agent.'),
      }),
      execute: async ({ subTaskType, prompt }) => {
        state.addSubAgentResult(subTaskType, prompt, '')
        return `Sub-agent "${subTaskType}" has been noted. Results will be incorporated.`
      },
    }),

    spawnSubAgents: tool({
      description: 'Spawn multiple specialized sub-agents in parallel.',
      inputSchema: z.object({
        subTasks: z
          .array(
            z.object({
              type: z.string(),
              prompt: z.string(),
            }),
          )
          .describe('Array of sub-tasks to execute in parallel.'),
      }),
      execute: async ({ subTasks }) => {
        for (const st of subTasks) {
          state.addSubAgentResult(st.type, st.prompt, '')
        }
        const summary = subTasks.map((st) => `"${st.type}"`).join(', ')
        return `Spawned ${subTasks.length} sub-agents in parallel: ${summary}.`
      },
    }),

    finalize: tool({
      description: 'Call when you have all the information needed. Provide the final synthesized answer.',
      inputSchema: z.object({
        answer: z.string().describe('The final answer or refined prompt for the task.'),
      }),
      execute: async ({ answer }) => {
        state.appendContext(answer)
        state.markCompleted()
        return 'Final answer recorded.'
      },
    }),

    // ─── Daemon Agent Tools ────────────────────────────────────────────

    spawnDaemonAgent: tool({
      description:
        'Spawn a daemon sub-agent that runs in an infinite loop, continuously working until explicitly stopped. Useful for ongoing monitoring, continuous code review, live background tasks, or persistent worker processes.' +
        ' The daemon runs autonomously in a sandbox, iterating on its instructions and reporting results on each loop.',
      inputSchema: z.object({
        label: z
          .string()
          .describe('Human-readable name for this daemon agent (e.g., "live-code-reviewer", "background-monitor")'),
        agentType: z
          .string()
          .optional()
          .default('claude')
          .describe('Agent CLI to use: claude, cursor, codex, gemini, copilot, opencode'),
        instructions: z
          .string()
          .describe('The continuous task for the daemon. It will iterate on these instructions forever.'),
        model: z.string().optional().describe('Model override for this daemon'),
        loopIntervalMs: z
          .number()
          .optional()
          .default(30000)
          .describe('Milliseconds between loop iterations (default 30s)'),
        maxIterations: z
          .number()
          .optional()
          .default(0)
          .describe('Max iterations before auto-stop (0 = infinite loop, default)'),
      }),
      execute: async ({ label, agentType, instructions, model, loopIntervalMs, maxIterations }) => {
        const id = `daemon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const agentTypeValue = agentType as DaemonAgentSpec['agentType']

        const daemon: DaemonAgentStatus = {
          id,
          label,
          agentType: agentTypeValue,
          status: 'starting',
          iterations: 0,
          sandboxId: undefined,
          startedAt: Date.now(),
          lastIterationAt: undefined,
        }

        state.addDaemonAgent(daemon)

        // Actually deploy the daemon in a real sandbox via the worker manager, and
        // mirror every status update back into the orchestrator state so that
        // `listDaemonAgents` and the /agents page observe the same daemon.
        void spawnDaemonAgent(
          {
            id,
            label,
            agentType: agentTypeValue,
            instructions,
            model,
            loopIntervalMs,
            maxIterations,
          },
          (status) => state.addDaemonAgent(status),
        ).catch(() => {
          state.addDaemonAgent({ ...daemon, status: 'error', lastError: 'Failed to launch daemon sandbox' })
        })

        const loopMsg = maxIterations && maxIterations > 0 ? `up to ${maxIterations} iterations` : 'infinite loop'

        return [
          `🔄 **Daemon agent spawned: "${label}"** (${loopMsg})`,
          `   ID: \`${id}\``,
          `   Agent: ${agentType || 'claude'}${model ? ` (${model})` : ''}`,
          `   Loop interval: ${loopIntervalMs ? loopIntervalMs / 1000 : 30}s`,
          '',
          `The daemon agent "${label}" is being initialized. It will begin iterating on: "${instructions}"`,
          `Use \`stopDaemonAgent\` to stop it, or \`listDaemonAgents\` to check its status.`,
        ].join('\n')
      },
    }),

    stopDaemonAgent: tool({
      description: 'Stop a running daemon agent by its ID. The daemon will be terminated and its sandbox cleaned up.',
      inputSchema: z.object({
        daemonId: z.string().describe('The ID of the daemon agent to stop.'),
      }),
      execute: async ({ daemonId }) => {
        const agent = state.getDaemonAgent(daemonId)
        if (!agent) {
          return `No daemon agent found with ID "${daemonId}". Use \`listDaemonAgents\` to see active daemons.`
        }

        if (agent.status === 'stopped') {
          return `Daemon agent "${agent.label}" is already stopped.`
        }

        // Stop the real sandbox-backed daemon if it is running, then update state.
        const stopResult = await stopDaemonAgent(daemonId)

        agent.status = 'stopped'
        if (!stopResult.success) {
          agent.lastError = stopResult.error
        }
        state.addDaemonAgent(agent)

        return [
          `🛑 **Daemon agent stopped: "${agent.label}"**`,
          `   ID: \`${agent.id}\``,
          `   Total iterations: ${agent.iterations}`,
          `   Runtime: ${((Date.now() - agent.startedAt) / 1000).toFixed(1)}s`,
          stopResult.success ? '' : `   Note: sandbox stop reported: ${stopResult.error}`,
        ].join('\n')
      },
    }),

    listDaemonAgents: tool({
      description: 'List all active daemon agents with their current status, iteration count, and last result.',
      inputSchema: z.object({}),
      execute: async () => {
        // Merge live worker-manager statuses (real sandboxes) into state first.
        for (const liveStatus of getDaemonAgentStatuses()) {
          state.addDaemonAgent(liveStatus)
        }

        const daemons = state.daemonAgents
        if (daemons.length === 0) {
          return 'No daemon agents are currently running. Use `spawnDaemonAgent` to create one.'
        }

        const lines = [`📋 **Daemon Agents** (${daemons.length} total):`, '']

        for (const d of daemons) {
          const statusEmoji =
            d.status === 'running'
              ? '🟢'
              : d.status === 'starting'
                ? '🟡'
                : d.status === 'paused'
                  ? '⏸️'
                  : d.status === 'error'
                    ? '🔴'
                    : d.status === 'stopped'
                      ? '⚫'
                      : '❓'

          const runtime = ((Date.now() - d.startedAt) / 1000).toFixed(0)
          lines.push(`${statusEmoji} **${d.label}** (\`${d.id}\`)`)
          lines.push(
            `   Status: ${d.status} | Iterations: ${d.iterations} | Runtime: ${runtime}s | Agent: ${d.agentType}`,
          )
          if (d.lastResult) {
            lines.push(`   Last result: ${d.lastResult.slice(0, 120)}${d.lastResult.length > 120 ? '...' : ''}`)
          }
          if (d.lastError) {
            lines.push(`   Last error: ${d.lastError.slice(0, 120)}${d.lastError.length > 120 ? '...' : ''}`)
          }
          lines.push('')
        }

        return lines.join('\n')
      },
    }),
  }
}
