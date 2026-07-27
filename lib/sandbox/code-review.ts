import { Sandbox } from '@vercel/sandbox'
import { runInProject } from './commands'

export interface CodeReviewResult {
  summary: string
  issues: Array<{ severity: string; file: string; line?: number; message: string }>
}

export async function reviewChanges(
  sandbox: Sandbox,
  instruction: string,
  diffOutput?: string,
): Promise<CodeReviewResult> {
  const defaultIssues: CodeReviewResult = { summary: 'Review skipped', issues: [] }

  try {
    let diff: string
    if (diffOutput) {
      diff = diffOutput
    } else {
      const result = await runInProject(sandbox, 'git', ['diff', 'HEAD'])
      diff = result.output || ''
    }

    if (!diff.trim()) {
      return { summary: 'No changes to review', issues: [] }
    }

    const reviewPrompt = `Review the following code changes made for this task: "${instruction.slice(0, 200)}"

Changes:
${diff.slice(0, 8000)}

Analyze for:
- correctness
- security issues
- code quality
- potential regressions

Output a JSON with "summary" (string) and "issues" (array of {severity, file, line?, message})`

    const result = await runInProject(sandbox, 'sh', ['-c', `echo "${reviewPrompt}" | head -c 10000 > /tmp/review-prompt.txt`])
    if (!result.success) return defaultIssues

    return {
      summary: 'Code review requested — run manually with: cat /tmp/review-prompt.txt | claude',
      issues: [],
    }
  } catch {
    return defaultIssues
  }
}
