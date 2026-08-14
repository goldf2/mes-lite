import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { completeEquipmentInspectionSchema } from '@/modules/equipment/contracts/equipment-inspection-schema'
import { EquipmentDomainError } from '@/modules/equipment/domain/equipment-errors'
import { completeEquipmentInspection } from '@/modules/equipment/server/equipment-inspection-command-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('equipmentInspections', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const result = await completeEquipmentInspection(params.id, completeEquipmentInspectionSchema.parse(await req.json()), {
      operatorId: operator.id, operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: result }, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof EquipmentDomainError || error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('完成设备点检失败:', error)
    return NextResponse.json({ error: '完成设备点检失败' }, { status: 500 })
  }
}
