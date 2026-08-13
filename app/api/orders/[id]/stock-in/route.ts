import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { legacyProductionOrderStockInSchema } from '@/modules/production/contracts/legacy-production-order-execution-schema'
import { productionOrderHttpError } from '@/modules/production/http/production-order-http'
import { stockInLegacyProductionOrder } from '@/modules/production/server/legacy-production-order-stock-in-service'
import { assertProductionOrderIdDataScope, loadEffectiveDataScope } from '@/modules/identity-access'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'update')
    if (denied) return denied
    const input = legacyProductionOrderStockInSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    await assertProductionOrderIdDataScope(await loadEffectiveDataScope(operator), params.id)
    await stockInLegacyProductionOrder(params.id, input, operatorDisplayName(operator))
    return NextResponse.json({ success: true, message: '入库成功' })
  } catch (error) {
    return productionOrderHttpError(error, '入库失败')
  }
}
