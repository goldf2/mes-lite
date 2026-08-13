import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { MaterialInDomainError } from '@/modules/receiving/domain/material-in-errors'
import { receiveManagedMaterialIn } from '@/modules/receiving/server/material-in-status-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialIn', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { current, updated } = await receiveManagedMaterialIn(params.id, operatorDisplayName(operator), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'RECEIVE', entityType: 'MATERIAL_IN', entityId: updated.id,
      entityLabel: updated.inboundNo, beforeData: current, afterData: updated,
    })
    return NextResponse.json({ success: true, message: '收货成功' })
  } catch (error) {
    if (error instanceof MaterialInDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Receive material-in error:', error)
    return NextResponse.json({ error: '确认收货失败' }, { status: 500 })
  }
}
