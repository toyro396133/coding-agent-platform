export interface LocalExecutionResult {
  available: boolean
  reason?: string
}

export async function checkLocalEnvironment(): Promise<LocalExecutionResult> {
  try {
    const { execSync } = await import('child_process')

    let hasOllama = false
    let hasOpenCode = false

    try {
      execSync('ollama --version', { stdio: 'ignore', timeout: 5000 })
      hasOllama = true
    } catch {}

    try {
      execSync('opencode --version', { stdio: 'ignore', timeout: 5000 })
      hasOpenCode = true
    } catch {}

    if (hasOllama || hasOpenCode) {
      return { available: true }
    }

    return {
      available: false,
      reason: hasOllama ? 'Ollama found but opencode not installed' : hasOpenCode ? 'opencode found but Ollama not installed' : 'No local tools found. Install ollama (ollama.com) or opencode (npm i -g opencode-ai)',
    }
  } catch {
    return { available: false, reason: 'Could not check local environment' }
  }
}
