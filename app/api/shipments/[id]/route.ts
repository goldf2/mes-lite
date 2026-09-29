import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { getShipmentDetail } from '@/modules/sales/server/fulfillment-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { z } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { shipmentPricesSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { updateShipmentPrices } from '@/modules/sales/server/shipment-pricing-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const input = shipmentPricesSchema.parse(await req.json())
    return NextResponse.json({ data: await updateShipmentPrices(params.id, input, await loadEffectiveDataScope(operator), await getAuditContext(req)) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '价格参数错误' }, { status: 400 })
    if (error instanceof SalesDomainError || error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Update shipment prices error:', error)
    return NextResponse.json({ error: '保存发货价格失败' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await getShipmentDetail(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get shipment detail error:', error)
    return NextResponse.json({ error: '获取发货单详情失败' }, { status: 500 })
  }
}
