import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { runInProject } from '@/lib/sandbox/commands'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { getServerSession } from '@/lib/session/get-server-session'

interface RouteParams {
  params: Promise<{ taskId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const task = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    if (!task[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const sandbox = getSandbox(taskId)
    if (!sandbox) {
      return NextResponse.json({ error: 'No active sandbox for this task' }, { status: 400 })
    }

    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'status': {
        const result = await runInProject(sandbox, 'git', ['status'])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'log': {
        const count = body.count || 10
        const result = await runInProject(sandbox, 'git', ['log', `--oneline`, `-${count}`])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'diff': {
        const result = await runInProject(sandbox, 'git', ['diff'])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'diff:cached': {
        const result = await runInProject(sandbox, 'git', ['diff', '--cached'])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'pull': {
        const currentBranch = await runInProject(sandbox, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        if (!currentBranch.success || !currentBranch.output?.trim() || currentBranch.output.trim() === 'HEAD') {
          return NextResponse.json({ success: false, error: 'Cannot pull in detached HEAD state' })
        }
        const branch = currentBranch.output.trim()
        const result = await runInProject(sandbox, 'git', ['pull', 'origin', branch])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'push': {
        const currentBranch = await runInProject(sandbox, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        if (!currentBranch.success || !currentBranch.output?.trim() || currentBranch.output.trim() === 'HEAD') {
          return NextResponse.json({ success: false, error: 'Cannot push from detached HEAD state' })
        }
        const branch = currentBranch.output.trim()
        const result = await runInProject(sandbox, 'git', ['push', 'origin', branch])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'commit': {
        const { message } = body
        if (!message) {
          return NextResponse.json({ error: 'Commit message is required' }, { status: 400 })
        }
        const addResult = await runInProject(sandbox, 'git', ['add', '.'])
        if (!addResult.success) {
          return NextResponse.json({ success: false, error: 'Failed to stage files' })
        }
        const commitResult = await runInProject(sandbox, 'git', ['commit', '-m', message])
        return NextResponse.json({
          success: commitResult.success,
          output: commitResult.success ? commitResult.output || '' : '',
        })
      }

      case 'branch': {
        const result = await runInProject(sandbox, 'git', ['branch', '-a'])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'checkout': {
        const { branch } = body
        if (!branch) {
          return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
        }
        const result = await runInProject(sandbox, 'git', ['checkout', branch])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      case 'fetch': {
        const result = await runInProject(sandbox, 'git', ['fetch', '--all'])
        return NextResponse.json({ success: result.success, output: result.success ? result.output || '' : '' })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (_error) {
    console.error('Git operation failed')
    return NextResponse.json({ error: 'Git operation failed' }, { status: 500 })
  }
}
