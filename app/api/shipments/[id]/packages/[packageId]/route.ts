import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { archiveShipmentPackage } from '@/modules/sales/server/shipment-package-command-service'
import { getShipmentPackage } from '@/modules/sales/server/shipment-package-query-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

type RouteParams = { params: { id: string; packageId: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    return NextResponse.json({ data: await getShipmentPackage(params.id, params.packageId, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Get shipment package error:', error)
    return NextResponse.json({ error: '获取货箱单据失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const denied = await requireResourcePermission('shipmentDispatch', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { before, updated } = await archiveShipmentPackage(
      params.id,
      params.packageId,
      operatorDisplayName(operator),
      await loadEffectiveDataScope(operator),
    )
    await writeAuditLog(req, {
      action: 'ARCHIVE',
      entityType: 'PACKAGE_DOCUMENT',
      entityId: updated.id,
      entityLabel: updated.packageNo,
      beforeData: before,
      afterData: updated,
    })
    return NextResponse.json({ success: true, message: '货箱单据已归档' })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Archive shipment package error:', error)
    return NextResponse.json({ error: '归档货箱单据失败' }, { status: 500 })
  }
}
