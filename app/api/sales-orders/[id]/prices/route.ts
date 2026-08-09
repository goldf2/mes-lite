import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { updateSalesOrderPriceSchema } from '@/modules/sales/contracts/sales-order-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { updateManagedSalesOrderPrices } from '@/modules/sales/server/sales-order-command-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'update')
    if (denied) return denied
    const [input, auditContext] = await Promise.all([
      req.json().then((body) => updateSalesOrderPriceSchema.parse(body)),
      getAuditContext(req),
    ])
    const updated = await updateManagedSalesOrderPrices(params.id, input, auditContext)
    return NextResponse.json({ data: updated, message: '销售订单价格已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Adjust sales order price error:', error)
    return NextResponse.json({ error: '调整销售订单价格失败' }, { status: 500 })
  }
}
