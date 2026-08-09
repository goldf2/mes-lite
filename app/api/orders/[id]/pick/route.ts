import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { legacyProductionOrderPickSchema } from '@/modules/production/contracts/legacy-production-order-execution-schema'
import { productionOrderHttpError } from '@/modules/production/http/production-order-http'
import { pickLegacyProductionOrder } from '@/modules/production/server/legacy-production-order-pick-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied

    const result = await pickLegacyProductionOrder(
      params.id,
      legacyProductionOrderPickSchema.parse(await req.json()),
    )
    await writeAuditLog(req, {
      action: 'PICK',
      entityType: 'ORDER',
      entityId: result.order.id,
      entityLabel: result.order.orderNo,
      afterData: result.items,
      note: '兼容工单领料扣减库存和成本',
    })
    return NextResponse.json({ success: true, message: '领料完成' })
  } catch (error) {
    return productionOrderHttpError(error, '领料失败')
  }
}
