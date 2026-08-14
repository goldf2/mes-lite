import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { equipmentMaintenancePlanActionSchema } from '@/modules/equipment/contracts/equipment-maintenance-schema'
import { equipmentMaintenanceHttpError } from '@/modules/equipment/http/equipment-maintenance-http'
import { changeEquipmentMaintenancePlanStatus } from '@/modules/equipment/server/equipment-maintenance-command-service'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('equipmentMaintenance', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const input = equipmentMaintenancePlanActionSchema.parse({ ...await req.json(), id: params.id })
    const data = await changeEquipmentMaintenancePlanStatus(input.id, input.action, {
      operatorId: operator.id, operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data })
  } catch (error) { return equipmentMaintenanceHttpError(error, '更新设备保养计划失败') }
}
