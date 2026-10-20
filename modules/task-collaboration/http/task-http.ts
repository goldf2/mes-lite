import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getCurrentOperator } from '@/lib/auth'
import { getAuditContext, type AuditContext } from '@/lib/audit'
import { hasResourcePermission, type PermissionAction } from '@/lib/permissions'
import { DataScopeError, loadEffectiveDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { TaskCollaborationDomainError } from '../domain/task-errors'
import type { TaskActor } from '../server/task-command-service'

type Context = { actor: TaskActor; scope: EffectiveDataScope; audit: AuditContext }
export async function taskHttp(req: NextRequest, action: PermissionAction, publish: boolean, run: (context: Context) => Promise<NextResponse>) {
  try {
    const actor = await getCurrentOperator()
    if (!actor) return NextResponse.json({ error: '请先登录', code: 'UNAUTHENTICATED' }, { status: 401 })
    if (!await hasResourcePermission(actor, 'taskCollaboration', 'read') || !await hasResourcePermission(actor, 'taskCollaboration', action)
      || (publish && !await hasResourcePermission(actor, 'taskCollaborationPublish', 'update'))) {
      return NextResponse.json({ error: '无任务操作权限', code: 'PERMISSION_DENIED' }, { status: 403 })
    }
    return await run({ actor, scope: await loadEffectiveDataScope(actor), audit: await getAuditContext(req) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '参数错误', code: 'VALIDATION_ERROR', details: error.errors }, { status: 400 })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON参数无效', code: 'VALIDATION_ERROR' }, { status: 400 })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message, code: 'SCOPE_DENIED' }, { status: 403 })
    if (error instanceof TaskCollaborationDomainError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    if (error instanceof Error && error.name === 'AttachmentDomainError') {
      const status = (error as Error & { status: number }).status || 400
      return NextResponse.json({ error: error.message, code: status === 404 ? 'FILE_UNAVAILABLE' : status === 403 ? 'PERMISSION_DENIED' : 'INVALID_REFERENCE' }, { status })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return NextResponse.json({ error: '操作与当前任务版本冲突，请刷新后重试', code: 'VERSION_CONFLICT' }, { status: 409 })
    console.error('Task collaboration request failed:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: '任务操作失败', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
