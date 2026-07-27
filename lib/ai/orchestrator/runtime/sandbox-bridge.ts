import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { runCommandInSandbox, runInProject } from '@/lib/sandbox/commands'
import type { CommandResult } from '@/lib/sandbox/commands'

export class SandboxBridge {
  private taskId: string

  constructor(taskId: string) {
    this.taskId = taskId
  }

  private getSandboxOrThrow() {
    const sandbox = getSandbox(this.taskId)
    if (!sandbox) throw new Error('No active sandbox found for this task')
    return sandbox
  }

  isAvailable(): boolean {
    return getSandbox(this.taskId) !== undefined
  }

  async runCommand(command: string, args: string[] = []): Promise<CommandResult> {
    const sandbox = this.getSandboxOrThrow()
    return runCommandInSandbox(sandbox, command, args)
  }

  async runInProject(command: string, args: string[] = []): Promise<CommandResult> {
    const sandbox = this.getSandboxOrThrow()
    return runInProject(sandbox, command, args)
  }

  async readFile(path: string, offset?: number, limit?: number): Promise<string> {
    const sandbox = this.getSandboxOrThrow()
    let cmd: string
    let cmdArgs: string[]
    if (offset !== undefined) {
      if (limit !== undefined) {
        cmd = 'dd'
        cmdArgs = [`if=${path}`, 'bs=1', `skip=${offset}`, `count=${limit}`, '2>/dev/null']
      } else {
        cmd = 'tail'
        cmdArgs = ['-c', `+${offset + 1}`, path]
      }
    } else if (limit !== undefined) {
      cmd = 'head'
      cmdArgs = ['-c', String(limit), path]
    } else {
      cmd = 'cat'
      cmdArgs = [path]
    }
    const result = await runInProject(sandbox, cmd, cmdArgs)
    return result.output || ''
  }

  async writeFile(path: string, content: string): Promise<void> {
    const sandbox = this.getSandboxOrThrow()
    const b64 = Buffer.from(content, 'utf8').toString('base64')
    const escapedPath = path.replace(/'/g, "'\\''")
    await runInProject(sandbox, 'sh', ['-c', `mkdir -p "$(dirname '${escapedPath}')"`])
    await runInProject(sandbox, 'sh', ['-c', `printf '%s' '${b64}' | base64 -d > '${escapedPath}'`])
  }

  async editFile(path: string, oldString: string, newString: string, replaceAll?: boolean): Promise<void> {
    const sandbox = this.getSandboxOrThrow()
    const pb64 = Buffer.from(path, 'utf8').toString('base64')
    const ob64 = Buffer.from(oldString, 'utf8').toString('base64')
    const nb64 = Buffer.from(newString, 'utf8').toString('base64')
    const script = replaceAll
      ? `const fs=require('fs');const p=Buffer.from('${pb64}','base64').toString();const o=Buffer.from('${ob64}','base64').toString();const n=Buffer.from('${nb64}','base64').toString();let c=fs.readFileSync(p,'utf8');c=c.split(o).join(n);fs.writeFileSync(p,c);console.log('edited')`
      : `const fs=require('fs');const p=Buffer.from('${pb64}','base64').toString();const o=Buffer.from('${ob64}','base64').toString();const n=Buffer.from('${nb64}','base64').toString();let c=fs.readFileSync(p,'utf8');c=c.replace(o,n);fs.writeFileSync(p,c);console.log('edited')`
    await runInProject(sandbox, 'node', ['-e', script])
  }

  async glob(pattern: string, basePath?: string): Promise<string[]> {
    const sandbox = this.getSandboxOrThrow()
    const searchPath = basePath || '.'
    const escapedPath = searchPath.replace(/'/g, "'\\''")
    const escapedPattern = pattern.replace(/'/g, "'\\''")
    const result = await runInProject(sandbox, 'sh', ['-c', `find '${escapedPath}' -name '${escapedPattern}' -type f 2>/dev/null | sort`])
    if (!result.output) return []
    return result.output.trim().split('\n').filter(Boolean)
  }

  async grep(pattern: string, searchPath?: string, include?: string): Promise<string[]> {
    const sandbox = this.getSandboxOrThrow()
    const path = searchPath || '.'
    const escapedPath = path.replace(/'/g, "'\\''")
    const escapedPattern = pattern.replace(/'/g, "'\\''")
    let cmd: string
    if (include) {
      const escapedInclude = include.replace(/'/g, "'\\''")
      cmd = `grep -rn --include='${escapedInclude}' '${escapedPattern}' '${escapedPath}' 2>/dev/null | head -200`
    } else {
      cmd = `grep -rn '${escapedPattern}' '${escapedPath}' 2>/dev/null | head -200`
    }
    const result = await runInProject(sandbox, 'sh', ['-c', cmd])
    if (!result.output) return []
    return result.output.trim().split('\n').filter(Boolean)
  }
}
