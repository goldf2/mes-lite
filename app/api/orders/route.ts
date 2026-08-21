import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireResourcePermission } from '@/lib/permissions'
import { getAuditContext, writeAuditLog } from '@/lib/audit'
import { parseStatusFilter } from '@/lib/status-filter'
import { createProductionOrderSchema } from '@/modules/production/contracts/production-order-schema'
import { archiveProductionOrder, createProductionOrders } from '@/modules/production/server/production-order-command-service'
import { ProductionOrderDomainError } from '@/modules/production/domain/production-order-errors'
import { listProductionOrders } from '@/modules/production/server/production-order-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { assertProductionOrderIdDataScope, DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { parseResourceSearchConditions } from '@/lib/resource-search'
import { productionOrderSearchFieldKeys } from '@/modules/production/model/production-search-fields'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied
    const result = await createProductionOrders(
      createProductionOrderSchema.parse(await req.json()),
      new Date(),
      await getAuditContext(req),
    )

    return NextResponse.json({
      data: result.first,
      items: result.items,
      count: result.items.length,
      groupNo: result.groupNo,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create order error:', error)
    return NextResponse.json({ error: '创建生产订单失败' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const statuses = parseStatusFilter(searchParams)
    const advanced = parseResourceSearchConditions(searchParams.get('advanced'), productionOrderSearchFieldKeys)
    if (advanced.error) return NextResponse.json({ error: advanced.error }, { status: 400 })
    const result = await listProductionOrders({
      statuses,
      keyword: searchParams.get('keyword')?.trim(),
      customerId: searchParams.get('customerId'),
      advancedConditions: advanced.conditions,
      page: Number(searchParams.get('page') ?? '1'),
      pageSize: Number(searchParams.get('pageSize') ?? '20'),
    }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: result.items, pagination: result.pagination })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json({ error: '获取生产订单列表失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('orders', 'delete')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少生产订单 ID' }, { status: 400 })
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    await assertProductionOrderIdDataScope(await loadEffectiveDataScope(operator), id)

    const { current, updated } = await archiveProductionOrder(id)

    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'ORDER',
      entityId: updated.id,
      entityLabel: updated.orderNo,
      beforeData: current,
      afterData: updated,
    })

    return NextResponse.json({ success: true, message: '生产订单已归档，可在归档记录中恢复' })
  } catch (error) {
    if (error instanceof ProductionOrderDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Archive order error:', error)
    return NextResponse.json({ error: '归档生产订单失败' }, { status: 500 })
  }
}
