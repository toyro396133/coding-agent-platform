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

  const modelFlag = options.model ? ` --model "${options.model}"` : ''
  const sessionFlag = options.sessionId ? ` --session "${options.sessionId}"` : ''
  const providerFlag = options.provider ? ` --provider "${options.provider}"` : ''

  const cmd = `npx opencode-ai run${modelFlag}${providerFlag}${sessionFlag} "${options.instruction}"`
  const result = await bridge.runInProject('sh', ['-c', cmd])

  return {
    success: result.success,
    output: result.output || '',
    changesDetected: !!(result.output && result.output.includes('changes detected')),
  }
}
