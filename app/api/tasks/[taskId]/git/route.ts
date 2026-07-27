import { NextRequest, NextResponse } from 'next/server'
import { getSandbox } from '@/lib/sandbox/sandbox-registry'
import { runInProject } from '@/lib/sandbox/commands'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

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
        return NextResponse.json({ success: true, output: result.output || '', error: result.error })
      }

      case 'log': {
        const count = body.count || 10
        const result = await runInProject(sandbox, 'git', ['log', `--oneline`, `-${count}`])
        return NextResponse.json({ success: true, output: result.output || '', error: result.error })
      }

      case 'diff': {
        const result = await runInProject(sandbox, 'git', ['diff'])
        return NextResponse.json({ success: true, output: result.output || '', error: result.error })
      }

      case 'diff:cached': {
        const result = await runInProject(sandbox, 'git', ['diff', '--cached'])
        return NextResponse.json({ success: true, output: result.output || '', error: result.error })
      }

      case 'pull': {
        const currentBranch = await runInProject(sandbox, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        const branch = currentBranch.output?.trim() || 'main'
        const result = await runInProject(sandbox, 'git', ['pull', 'origin', branch])
        return NextResponse.json({ success: result.success, output: result.output || '', error: result.error })
      }

      case 'push': {
        const currentBranch = await runInProject(sandbox, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        const branch = currentBranch.output?.trim() || 'main'
        const result = await runInProject(sandbox, 'git', ['push', 'origin', branch])
        return NextResponse.json({ success: result.success, output: result.output || '', error: result.error })
      }

      case 'commit': {
        const { message } = body
        if (!message) {
          return NextResponse.json({ error: 'Commit message is required' }, { status: 400 })
        }
        const addResult = await runInProject(sandbox, 'git', ['add', '.'])
        if (!addResult.success) {
          return NextResponse.json({ success: false, output: addResult.output || '', error: addResult.error || 'Failed to add files' })
        }
        const commitResult = await runInProject(sandbox, 'git', ['commit', '-m', message])
        return NextResponse.json({ success: commitResult.success, output: commitResult.output || '', error: commitResult.error })
      }

      case 'branch': {
        const result = await runInProject(sandbox, 'git', ['branch', '-a'])
        return NextResponse.json({ success: true, output: result.output || '', error: result.error })
      }

      case 'checkout': {
        const { branch } = body
        if (!branch) {
          return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
        }
        const result = await runInProject(sandbox, 'git', ['checkout', branch])
        return NextResponse.json({ success: result.success, output: result.output || '', error: result.error })
      }

      case 'fetch': {
        const result = await runInProject(sandbox, 'git', ['fetch', '--all'])
        return NextResponse.json({ success: result.success, output: result.output || '', error: result.error })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Git operation error:', error)
    return NextResponse.json({ error: 'Git operation failed' }, { status: 500 })
  }
}
