import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { equipmentEventCommandSchema } from '@/modules/equipment/contracts/equipment-event-schema'
import { EquipmentDomainError } from '@/modules/equipment/domain/equipment-errors'
import { listEquipmentEvents, recordEquipmentEvent } from '@/modules/equipment/server/equipment-event-service'

function equipmentEventHttpError(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
  if (error instanceof EquipmentDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('设备事件失败:', error)
  return NextResponse.json({ error: '设备事件处理失败' }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('equipment', 'read')
    if (denied) return denied
    return NextResponse.json({ data: await listEquipmentEvents(params.id) })
  } catch (error) {
    return equipmentEventHttpError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('equipmentEvents', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const input = equipmentEventCommandSchema.parse(await req.json())
    const result = await recordEquipmentEvent(params.id, input, {
      operatorId: operator.id, operatorName: operatorDisplayName(operator),
    })
    await writeAuditLog(req, {
      action: `EQUIPMENT_${input.action}`, entityType: 'EQUIPMENT', entityId: result.equipment.id,
      entityLabel: `${result.equipment.code} ${result.equipment.name}`, beforeData: result.existing,
      afterData: result.equipment, note: input.reason,
    })
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    return equipmentEventHttpError(error)
  }
}
