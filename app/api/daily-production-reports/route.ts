import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { legacyDailyProductionReportInputSchema } from '@/modules/production/contracts/legacy-daily-production-schema'
import { legacyDailyProductionHttpError } from '@/modules/production/http/legacy-daily-production-http'
import { createLegacyDailyProductionReport } from '@/modules/production/server/legacy-daily-production-command-service'
import { listLegacyDailyProductionWorkspace } from '@/modules/production/server/legacy-daily-production-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const workspace = await listLegacyDailyProductionWorkspace({
      keyword: searchParams.get('keyword'),
      status: searchParams.get('status'),
    })
    return NextResponse.json({
      data: workspace.reports,
      materials: workspace.materials,
      employees: workspace.employees,
    })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '获取生产记录失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stats', 'create')
    if (denied) return denied

    const input = legacyDailyProductionReportInputSchema.parse(await req.json())
    const report = await createLegacyDailyProductionReport(input)
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'DAILY_PRODUCTION_REPORT',
      entityId: report.id,
      entityLabel: report.reportNo,
      afterData: report,
      note: '创建生产记录草稿及 BOM 耗料快照',
    })
    return NextResponse.json({ data: report, message: '生产记录草稿已创建' }, { status: 201 })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '创建生产记录失败', true)
  }
}
