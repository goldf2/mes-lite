import { NextRequest, NextResponse } from 'next/server'
import { requireResourcePermission } from '@/lib/permissions'
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

    await createLegacyDailyProductionReport()
    return NextResponse.json({ error: '旧生产日报已停止新建' }, { status: 410 })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '创建生产记录失败', true)
  }
}
