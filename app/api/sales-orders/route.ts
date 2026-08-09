import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { parseStatusFilter } from '@/lib/status-filter'
import { createSalesOrderSchema } from '@/modules/sales/contracts/sales-order-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { createManagedSalesOrder } from '@/modules/sales/server/sales-order-command-service'
import { listSalesOrders } from '@/modules/sales/server/sales-order-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'read')
    if (denied) return denied
    const params = new URL(req.url).searchParams
    const page = Math.max(1, Number(params.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 30)))
    return NextResponse.json(await listSalesOrders({
      statuses: parseStatusFilter(params), keyword: params.get('keyword'), customerId: params.get('customerId'), page, pageSize,
    }))
  } catch (error) {
    console.error('Get sales orders error:', error)
    return NextResponse.json({ error: '获取销售订单失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('salesOrder', 'create')
    if (denied) return denied
    const order = await createManagedSalesOrder(createSalesOrderSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'SALES_ORDER', entityId: order.id, entityLabel: order.orderNo, afterData: order,
    })
    return NextResponse.json({ data: order }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create sales order error:', error)
    return NextResponse.json({ error: '创建销售订单失败' }, { status: 500 })
  }
}
