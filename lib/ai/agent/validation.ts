import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from '@/lib/sandbox/commands'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export async function validateProject(sandbox: Sandbox): Promise<ValidationResult> {
  try {
    // Run a type check using TypeScript (assuming tsc is installed in the project)
    // We use --noEmit so it just checks types without compiling files
    // We add || true so the script doesn't completely crash if there are type errors,
    // allowing us to capture the stdout/stderr.
    const result = await runCommandInSandbox(sandbox, 'npx', ['tsc', '--noEmit'])

    // In many setups, tsc outputs errors to stdout, not stderr.
    const output = result.output || ''

    // If exit code is 0, it usually means success
    if (result.exitCode === 0 && !output.includes('error TS')) {
      return {
        isValid: true,
        errors: [],
      }
    }

    // Parse the output to extract meaningful error lines
    // Basic extraction: lines containing 'error'
    const errorLines = output
      .split('\n')
      .filter((line) => line.toLowerCase().includes('error'))
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    return {
      isValid: false,
      errors: errorLines.length > 0 ? errorLines : [output.trim()],
    }
  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation command failed to execute: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}
