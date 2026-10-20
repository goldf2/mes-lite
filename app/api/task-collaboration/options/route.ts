import { NextRequest, NextResponse } from 'next/server'
import { hasResourcePermission, type PermissionResource } from '@/lib/permissions'
import { requireManagedAttachmentOwnerAccessForOperator } from '@/modules/attachments/server-index'
import { taskHttp } from '@/modules/task-collaboration/http/task-http'
import { taskOptionTypes, listTaskOptions, type TaskOptionType } from '@/modules/task-collaboration/server/task-query-service'
export async function GET(req: NextRequest) {
  return taskHttp(req, 'read', false, async ({ actor, scope }) => {
    const type = req.nextUrl.searchParams.get('type') as TaskOptionType
    if (!taskOptionTypes.includes(type)) return NextResponse.json({ error: '无效选项类型', code: 'VALIDATION_ERROR' }, { status: 400 })
    const resources: Record<TaskOptionType, PermissionResource> = { materials: 'materials', employees: 'employees', suppliers: 'suppliers',
      orders: 'orders', salesOrders: 'salesOrder', dispatches: 'dispatch', workCenters: 'workCenters', files: 'taskCollaboration' }
    if (!await hasResourcePermission(actor, resources[type], 'read')) return NextResponse.json({ error: '无关联资料读取权限', code: 'PERMISSION_DENIED' }, { status: 403 })
    if (type === 'files' && req.nextUrl.searchParams.get('taskId')) await requireManagedAttachmentOwnerAccessForOperator(actor, 'TASK_COLLABORATION', req.nextUrl.searchParams.get('taskId')!, 'read')
    return NextResponse.json({ data: await listTaskOptions(type, req.nextUrl.searchParams.get('keyword') || undefined, scope, req.nextUrl.searchParams.get('taskId') || undefined) })
  })
}
