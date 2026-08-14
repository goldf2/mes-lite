import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { MaterialInDomainError } from '@/modules/receiving/domain/material-in-errors'
import { rejectManagedMaterialIn } from '@/modules/receiving/server/material-in-status-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('materialInReceive', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const { current, updated } = await rejectManagedMaterialIn(params.id, await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'REJECT', entityType: 'MATERIAL_IN', entityId: updated.id,
      entityLabel: updated.inboundNo, beforeData: current, afterData: updated,
    })
    return NextResponse.json({ success: true, message: '拒收成功' })
  } catch (error) {
    if (error instanceof MaterialInDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Reject material-in error:', error)
    return NextResponse.json({ error: '拒收失败' }, { status: 500 })
  }
}
