import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { hasResourcePermission, type PermissionResource } from '@/lib/permissions'
import { findSopWorkflow, readSopScreenshot } from '@/modules/sop/server/sop-catalog'

export async function GET(_request: Request, { params }: { params: { workflowId: string } }) {
  const operator = await getCurrentOperator()
  if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const workflow = findSopWorkflow(params.workflowId)
  if (!workflow) return NextResponse.json({ error: 'SOP 流程不存在' }, { status: 404 })
  if (!(await hasResourcePermission(operator, workflow.resource as PermissionResource, 'read'))) return NextResponse.json({ error: '无权限' }, { status: 403 })
  try {
    const file = await readSopScreenshot(workflow)
    return new NextResponse(new Uint8Array(file), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
  } catch {
    return NextResponse.json({ error: 'SOP 截图不存在' }, { status: 404 })
  }
}
