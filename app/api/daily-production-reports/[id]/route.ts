import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { legacyDailyProductionReportInputSchema } from '@/modules/production/contracts/legacy-daily-production-schema'
import { legacyDailyProductionHttpError } from '@/modules/production/http/legacy-daily-production-http'
import { updateLegacyDailyProductionReport } from '@/modules/production/server/legacy-daily-production-command-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = legacyDailyProductionReportInputSchema.parse(await req.json())
    const { existing, report } = await updateLegacyDailyProductionReport(params.id, input)
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: report.id,
      entityLabel: report.reportNo,
      beforeData: existing,
      afterData: report,
    })
    return NextResponse.json({ data: report, message: '生产记录草稿已更新' })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '更新生产记录失败', true)
  }
}
