import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { legacyProductionOrderStockInSchema } from '@/modules/production/contracts/legacy-production-order-execution-schema'
import { productionOrderHttpError } from '@/modules/production/http/production-order-http'
import { stockInLegacyProductionOrder } from '@/modules/production/server/legacy-production-order-stock-in-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied
    await stockInLegacyProductionOrder(
      params.id,
      legacyProductionOrderStockInSchema.parse(await req.json()),
    )
    return NextResponse.json({ success: true, message: '入库成功' })
  } catch (error) {
    return productionOrderHttpError(error, '入库失败')
  }
}
