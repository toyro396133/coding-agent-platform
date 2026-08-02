import { SandboxBridge } from './sandbox-bridge'

export interface CapAgentOptions {
  instruction: string
  model?: string
  provider?: string
  sessionId?: string
}

export interface CapAgentResult {
  success: boolean
  output: string
  changesDetected: boolean
}

export async function executeCapAgent(taskId: string, options: CapAgentOptions): Promise<CapAgentResult> {
  const bridge = new SandboxBridge(taskId)
  if (!bridge.isAvailable()) {
    return { success: false, output: 'No active sandbox', changesDetected: false }
  }

  const args = ['opencode-ai', 'run']
  if (options.model) {
    args.push('--model', options.model)
  }
  if (options.provider) {
    args.push('--provider', options.provider)
  }
  if (options.sessionId) {
    args.push('--session', options.sessionId)
  }
  args.push(options.instruction)

  const result = await bridge.runInProject('npx', args)

  return {
    success: result.success,
    output: result.output || '',
    changesDetected: !!result.output?.includes('changes detected'),
  }
}
