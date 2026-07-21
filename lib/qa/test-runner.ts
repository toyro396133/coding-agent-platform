import { Sandbox } from '@vercel/sandbox'
import { db } from '@/lib/db/client'
import { backgroundTestsBank, backgroundTestExecutions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { runCommandInSandbox } from '@/lib/sandbox/commands'
import { getModelClient } from '@/lib/ai/models'
import { generateObject } from 'ai'
import { z } from 'zod'

export async function runBackgroundTests(options?: { taskId?: string; sandboxId?: string }) {
  // Query backgroundTestsBank for enabled tests
  const enabledTests = await db.select().from(backgroundTestsBank).where(eq(backgroundTestsBank.isEnabled, true))

  if (enabledTests.length === 0) {
    console.log('No enabled background tests found')
    return
  }

  let sandbox: Sandbox

  if (options?.sandboxId) {
    const existingSandbox = await Sandbox.get({ sandboxId: options.sandboxId })
    if (existingSandbox) {
      sandbox = existingSandbox
    } else {
      sandbox = await Sandbox.create()
    }
  } else if (options?.taskId) {
    const registeredSandbox = getSandbox(options.taskId)
    if (registeredSandbox) {
      sandbox = registeredSandbox
    } else {
      sandbox = await Sandbox.create()
    }
  } else {
    sandbox = await Sandbox.create()
  }

  for (const test of enabledTests) {
    const testFilePath = `tests/bg-${test.id}.ts`

    // Test code is stored in the description field for now per schema logic,
    // or we'd ideally have a code column. Assuming description contains the code snippet.
    const testCode = test.description || `console.log('Empty test for ${test.name}')`

    try {
      // Ensure directory exists
      await runCommandInSandbox(sandbox, 'mkdir', ['-p', 'tests'])

      // Write the test code into the sandbox
      await sandbox.writeFiles([
        {
          path: testFilePath,
          content: Buffer.from(testCode),
        },
      ])

      // Execute the test script
      console.log('Executing test...')
      const result = await runCommandInSandbox(sandbox, 'npx', ['tsx', testFilePath])

      // Record results
      const status = result.exitCode === 0 ? 'passed' : 'failed'
      const logs = `STDOUT:\n${result.output}\nSTDERR:\n${result.error}`

      console.log('Test execution completed')

      let executionStatus = status
      let remediationPatch = null

      if (status === 'failed') {
        console.log('Test failed, starting remediation loop...')
        const remediation = await executeRemediationLoop(sandbox, testFilePath, testCode, logs)
        if (remediation.success) {
          executionStatus = 'remediated'
          remediationPatch = remediation.patch
          console.log('Remediation applied successfully')
        } else {
          console.log('Remediation failed')
          remediationPatch = { error: 'Failed to remediate' }
        }
      }

      await db.insert(backgroundTestExecutions).values({
        testId: test.id,
        taskId: options?.taskId || null,
        status: executionStatus as any,
        logs,
        remediationPatch,
      })
    } catch (error) {
      console.error('Error executing test')

      await db.insert(backgroundTestExecutions).values({
        testId: test.id,
        taskId: options?.taskId || null,
        status: 'failed',
        logs: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

async function executeRemediationLoop(sandbox: Sandbox, testFilePath: string, testCode: string, logs: string) {
  try {
    const model = getModelClient('gpt-4o') // default to gpt-4o for fixing

    const { object } = await generateObject({
      model,
      schema: z.object({
        explanation: z.string(),
        modifiedFiles: z.array(
          z.object({
            filePath: z.string(),
            newContent: z.string(),
          }),
        ),
      }),
      prompt: `You are an expert autonomous test remediation agent.
A background test has failed. Please analyze the failure and provide a code fix.

Test File Path: ${testFilePath}
Test Code:
${testCode}

Execution Logs (Error Stack Trace):
${logs}

Please provide an explanation of the bug and the fix, and an array of modified files with their new content. Focus on modifying the test code or application code to make the test pass.`,
    })

    // Apply fixes
    const filesToWrite = object.modifiedFiles.map((file) => ({
      path: file.filePath,
      content: Buffer.from(file.newContent),
    }))

    if (filesToWrite.length > 0) {
      await sandbox.writeFiles(filesToWrite)
    }

    // Re-run the test
    const result = await runCommandInSandbox(sandbox, 'npx', ['tsx', testFilePath])

    if (result.exitCode === 0) {
      return { success: true, patch: object }
    } else {
      return { success: false, patch: null }
    }
  } catch (err) {
    return { success: false, patch: null }
  }
}

export async function seedDefaultBackgroundTests() {
  const existing = await db.select().from(backgroundTestsBank)
  if (existing.length === 0) {
    await db.insert(backgroundTestsBank).values({
      name: 'Sample Math Test',
      description: `
const assert = require('assert');
// Intentional failure to trigger remediation
assert.strictEqual(1 + 1, 3, "Math is broken");
console.log("Test passed!");
      `,
      tags: ['sample', 'math'],
    })
    console.log('Seeded sample background test')
  }
}
