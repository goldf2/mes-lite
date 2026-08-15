import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { getAuditContext } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { loadEffectiveDataScope } from '@/modules/identity-access'
import { legacyProductionOrderReportSchema } from '@/modules/production/contracts/legacy-production-order-execution-schema'
import { productionOrderHttpError } from '@/modules/production/http/production-order-http'
import { listLegacyProductionOrderReports, reportLegacyProductionOrder } from '@/modules/production/server/legacy-production-order-report-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    await reportLegacyProductionOrder(
      params.id,
      legacyProductionOrderReportSchema.parse(await req.json()),
      await loadEffectiveDataScope(operator),
      await getAuditContext(req),
    )
    return NextResponse.json({ success: true, message: '报工成功' })
  } catch (error) {
    return productionOrderHttpError(error, '报工失败')
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('orders', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '无权限' }, { status: 403 })
    return NextResponse.json({ data: await listLegacyProductionOrderReports(params.id, await loadEffectiveDataScope(operator)) })
  } catch (error) {
    return productionOrderHttpError(error, '获取报工记录失败')
  }
}
