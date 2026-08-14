import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { equipmentMaintenanceHttpError } from '@/modules/equipment/http/equipment-maintenance-http'
import { getEquipmentMaintenanceWorkspace } from '@/modules/equipment/server/equipment-maintenance-query-service'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipmentMaintenance', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const requested = req.nextUrl.searchParams.get('filter')
    const filter = requested === 'OPEN' || requested === 'HISTORY' || requested === 'ALL' ? requested : 'DUE'
    const data = await getEquipmentMaintenanceWorkspace({ filter, keyword: req.nextUrl.searchParams.get('keyword') }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data })
  } catch (error) { return equipmentMaintenanceHttpError(error, '获取设备维保任务失败') }
}
