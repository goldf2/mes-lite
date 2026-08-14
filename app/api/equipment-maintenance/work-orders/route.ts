import { NextRequest, NextResponse } from 'next/server'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { createCorrectiveMaintenanceWorkOrderSchema } from '@/modules/equipment/contracts/equipment-maintenance-schema'
import { equipmentMaintenanceHttpError } from '@/modules/equipment/http/equipment-maintenance-http'
import { createCorrectiveMaintenanceWorkOrder } from '@/modules/equipment/server/equipment-maintenance-command-service'
import { loadEffectiveDataScope } from '@/modules/identity-access'

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipmentMaintenance', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const result = await createCorrectiveMaintenanceWorkOrder(createCorrectiveMaintenanceWorkOrderSchema.parse(await req.json()), {
      operatorId: operator.id, operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: result }, { status: result.duplicate ? 200 : 201 })
  } catch (error) { return equipmentMaintenanceHttpError(error, '创建设备维修工单失败') }
}
