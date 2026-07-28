export interface LocalExecutionResult {
  available: boolean
  reason?: string
}

export async function checkLocalEnvironment(): Promise<LocalExecutionResult> {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    let hasOllama = false
    let hasOpenCode = false

    try {
      await execAsync('ollama --version', { timeout: 5000 })
      hasOllama = true
    } catch {}

    try {
      await execAsync('opencode --version', { timeout: 5000 })
      hasOpenCode = true
    } catch {}

    if (hasOllama || hasOpenCode) {
      return { available: true }
    }

    return {
      available: false,
      reason: hasOllama
        ? 'Ollama found but opencode not installed'
        : hasOpenCode
          ? 'opencode found but Ollama not installed'
          : 'No local tools found. Install ollama (ollama.com) or opencode (npm i -g opencode-ai)',
    }
  } catch {
    return { available: false, reason: 'Could not check local environment' }
  }
}
