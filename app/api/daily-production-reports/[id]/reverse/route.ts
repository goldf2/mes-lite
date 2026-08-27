import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { reverseLegacyDailyProductionSchema } from '@/modules/production/contracts/legacy-daily-production-schema'
import { legacyDailyProductionHttpError } from '@/modules/production/http/legacy-daily-production-http'
import { reverseLegacyDailyProductionReport } from '@/modules/production/server/legacy-daily-production-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('productionActualReverse', 'update')
    if (denied) return denied

    const input = reverseLegacyDailyProductionSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { result } = await reverseLegacyDailyProductionReport(params.id, input, operatorDisplayName(operator), new Date(), {
      scope: await loadEffectiveDataScope(operator),
      auditContext: await getAuditContext(req),
    })
    return NextResponse.json({ data: result, message: '生产记录已冲销，原料和成品库存已反向恢复' })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    return legacyDailyProductionHttpError(error, '冲销生产记录失败')
  }
}
