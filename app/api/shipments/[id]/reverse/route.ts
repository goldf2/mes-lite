import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { shipmentReverseSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { reverseManagedShipment } from '@/modules/sales/server/fulfillment-status-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipmentReverse', 'update')
    if (denied) return denied
    const input = shipmentReverseSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { before, updated } = await reverseManagedShipment(
      params.id,
      operatorDisplayName(operator),
      input.reason,
      await loadEffectiveDataScope(operator),
    )
    await writeAuditLog(req, {
      action: 'REVERSE', entityType: 'SHIPMENT', entityId: updated.id,
      entityLabel: updated.shipmentNo, beforeData: before, afterData: updated,
      note: input.reason,
    })
    return NextResponse.json({ success: true, message: '发货已冲销，库存、成本和批次余额已恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Reverse shipment error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '冲销发货失败' }, { status: 500 })
  }
}
