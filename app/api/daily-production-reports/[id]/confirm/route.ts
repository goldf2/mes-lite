import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { confirmLegacyDailyProductionSchema } from '@/modules/production/contracts/legacy-daily-production-schema'
import { legacyDailyProductionHttpError } from '@/modules/production/http/legacy-daily-production-http'
import { confirmLegacyDailyProductionReport } from '@/modules/production/server/legacy-daily-production-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = confirmLegacyDailyProductionSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    const confirmedBy = input.confirmedBy || operator?.name || operator?.username || '系统用户'
    const { before, result } = await confirmLegacyDailyProductionReport(params.id, confirmedBy)
    await writeAuditLog(req, {
      action: 'CONFIRM',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: result.id,
      entityLabel: result.reportNo,
      beforeData: before,
      afterData: result,
      note: '按生产方案（BOM）扣减投入并将产出增加到所选库位',
    })
    return NextResponse.json({ data: result, message: '生产记录已确认，原料和成品库存已同步更新' })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '确认生产记录失败')
  }
}
