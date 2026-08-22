import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'
import { dailyProductionShortcutSchema } from '@/modules/production/contracts/daily-production-shortcut-schema'
import { legacyDailyProductionHttpError } from '@/modules/production/http/legacy-daily-production-http'
import {
  createAndConfirmDailyProductionShortcut,
  listDailyProductionShortcutWorkspace,
} from '@/modules/production/server/daily-production-shortcut-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const workspace = await listDailyProductionShortcutWorkspace(await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: workspace.reports, materials: workspace.materials })
  } catch (error) {
    return legacyDailyProductionHttpError(error, '读取生产日报失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const input = dailyProductionShortcutSchema.parse(await req.json())
    const data = await createAndConfirmDailyProductionShortcut(
      input,
      await loadEffectiveDataScope(operator),
      operatorDisplayName(operator),
      await getAuditContext(req),
    )
    return NextResponse.json({ data, message: `生产日报 ${data.reportNo} 已过账，BOM 投入与产出库存已同步` })
  } catch (error) {
    if (error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    return legacyDailyProductionHttpError(error, '生产日报过账失败', true)
  }
}
