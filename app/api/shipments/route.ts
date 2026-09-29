import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { createShipmentSchema } from '@/modules/sales/contracts/fulfillment-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { archiveManagedShipment, createManagedShipment } from '@/modules/sales/server/fulfillment-command-service'
import { listShipments } from '@/modules/sales/server/fulfillment-query-service'
import { getCurrentOperator } from '@/lib/auth'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { shipmentHistoryCsvResponse, shipmentHistoryQuery } from '@/modules/sales/server/shipment-history'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const params = new URL(req.url).searchParams
    if (params.get('includeArchived') === 'true') {
      const archiveDenied = await requireResourcePermission('archive', 'read')
      if (archiveDenied) return archiveDenied
    }
    const result = await listShipments(shipmentHistoryQuery(params), await loadEffectiveDataScope(operator))
    return params.get('format') === 'csv' ? shipmentHistoryCsvResponse(result.data) : NextResponse.json(result)
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get shipments error:', error)
    return NextResponse.json({ error: '获取发货单列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const shipment = await createManagedShipment(createShipmentSchema.parse(await req.json()), new Date(), await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'SHIPMENT', entityId: shipment.id, entityLabel: shipment.shipmentNo, afterData: shipment,
    })
    return NextResponse.json({ data: shipment }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create shipment error:', error)
    return NextResponse.json({ error: '创建发货单失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('shipment', 'delete')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    const id = z.string().trim().min(1, '缺少发货单 ID').parse(new URL(req.url).searchParams.get('id'))
    const { before, updated } = await archiveManagedShipment(id, await loadEffectiveDataScope(operator))
    await writeAuditLog(req, {
      action: 'ARCHIVE', entityType: 'SHIPMENT', entityId: updated.id,
      entityLabel: updated.shipmentNo, beforeData: before, afterData: updated,
    })
    return NextResponse.json({ success: true, message: '发货单已归档，可在归档记录中恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Archive shipment error:', error)
    return NextResponse.json({ error: '归档发货单失败' }, { status: 500 })
  }
}
