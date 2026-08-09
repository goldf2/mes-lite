import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { reverseLegacyDailyProductionSchema } from '@/modules/production/contracts/legacy-daily-production-schema'
import { legacyDailyProductionHttpError } from '@/modules/production/http/legacy-daily-production-http'
import { reverseLegacyDailyProductionReport } from '@/modules/production/server/legacy-daily-production-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = reverseLegacyDailyProductionSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    const reversedBy = input.reversedBy || operator?.name || operator?.username || '系统用户'
    const { before, result } = await reverseLegacyDailyProductionReport(params.id, { ...input, reversedBy })
    await writeAuditLog(req, {
      action: 'REVERSE',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: result.id,
      entityLabel: result.reportNo,
      beforeData: before,
      afterData: result,
      note: input.reason,
    })
    return NextResponse.json({ data: result, message: '生产记录已冲销，原料和成品库存已反向恢复' })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '冲销生产记录失败')
  }
}
