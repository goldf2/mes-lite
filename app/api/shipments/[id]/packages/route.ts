import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { createShipmentPackageSchema } from '@/modules/sales/contracts/shipment-package-schema'
import { SalesDomainError } from '@/modules/sales/domain/sales-errors'
import { createShipmentPackage } from '@/modules/sales/server/shipment-package-command-service'
import { listShipmentPackages } from '@/modules/sales/server/shipment-package-query-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipment', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    return NextResponse.json({ data: await listShipmentPackages(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('List shipment packages error:', error)
    return NextResponse.json({ error: '获取货箱单据失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('shipmentDispatch', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const packageDocument = await createShipmentPackage(
      params.id,
      createShipmentPackageSchema.parse(await req.json()),
      operatorDisplayName(operator),
      new Date(),
      await loadEffectiveDataScope(operator),
    )
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'PACKAGE_DOCUMENT',
      entityId: packageDocument.id,
      entityLabel: packageDocument.packageNo,
      afterData: packageDocument,
      note: `关联发货单 ${params.id}`,
    })
    return NextResponse.json({ data: packageDocument }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '货箱参数错误' }, { status: 400 })
    if (error instanceof SalesDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Create shipment package error:', error)
    return NextResponse.json({ error: '创建货箱单据失败' }, { status: 500 })
  }
}
