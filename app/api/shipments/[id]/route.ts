import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { getShipmentDetail } from '@/modules/sales/server/fulfillment-query-service'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { z } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { shipmentPricesSchema, updateShipmentDraftSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { updateShipmentPrices } from '@/modules/sales/server/shipment-pricing-service'
import { updateShipmentDraft } from '@/modules/sales/server/shipment-draft-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const body = await req.json()
    const scope = await loadEffectiveDataScope(operator)
    const audit = await getAuditContext(req)
    // audit-covered-by: updateShipmentDraft, updateShipmentPrices
    const result = body?.mode === 'draft'
      ? await updateShipmentDraft(params.id, updateShipmentDraftSchema.parse(body), scope, audit, operatorDisplayName(operator))
      : await updateShipmentPrices(params.id, shipmentPricesSchema.parse(body), scope, audit)
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '发货参数错误' }, { status: 400 })
    if (error instanceof SalesDomainError || error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Update shipment error:', error)
    return NextResponse.json({ error: '保存发货单失败' }, { status: 500 })
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
