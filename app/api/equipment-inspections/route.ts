import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuditContext } from '@/lib/audit'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { equipmentInspectionPlanInputSchema } from '@/modules/equipment/contracts/equipment-inspection-schema'
import { EquipmentDomainError } from '@/modules/equipment/domain/equipment-errors'
import { createEquipmentInspectionPlan } from '@/modules/equipment/server/equipment-inspection-command-service'
import { getEquipmentInspectionWorkspace } from '@/modules/equipment/server/equipment-inspection-query-service'
import { DataScopeError, loadEffectiveDataScope } from '@/modules/identity-access'

export const dynamic = 'force-dynamic'

function equipmentInspectionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
  if (error instanceof EquipmentDomainError || error instanceof DataScopeError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(`${fallback}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipmentInspections', 'read')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const requested = req.nextUrl.searchParams.get('filter')
    const filter = requested === 'ALL' || requested === 'ABNORMAL' ? requested : 'DUE'
    const data = await getEquipmentInspectionWorkspace({ filter, keyword: req.nextUrl.searchParams.get('keyword') }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data })
  } catch (error) { return equipmentInspectionError(error, '获取设备点检任务失败') }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('equipmentInspections', 'create')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const saved = await createEquipmentInspectionPlan(equipmentInspectionPlanInputSchema.parse(await req.json()), {
      operatorId: operator.id, operatorName: operatorDisplayName(operator), auditContext: await getAuditContext(req),
    }, await loadEffectiveDataScope(operator))
    return NextResponse.json({ data: saved }, { status: 201 })
  } catch (error) { return equipmentInspectionError(error, '创建设备点检计划失败') }
}
