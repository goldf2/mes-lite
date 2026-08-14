import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { returnRejectSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { rejectManagedReturn } from '@/modules/sales/server/fulfillment-status-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('returnReject', 'update')
    if (denied) return denied
    const input = returnRejectSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const { before, updated } = await rejectManagedReturn(params.id, await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'REJECT', entityType: 'RETURN', entityId: updated.id,
      entityLabel: updated.returnNo, beforeData: before, afterData: updated, note: input.reason,
    })
    return NextResponse.json({ success: true, message: '退货已拒绝' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Reject return error:', error)
    return NextResponse.json({ error: '拒绝退货失败' }, { status: 500 })
  }
}
