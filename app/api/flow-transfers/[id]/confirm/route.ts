import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { confirmFlowTransferSchema } from '@/modules/production/contracts/flow-transfer-schema'
import { FlowTransferDomainError } from '@/modules/production/domain/flow-transfer-errors'
import { confirmManagedFlowTransfer } from '@/modules/production/server/flow-transfer-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('flowTransfers', 'update')
    if (denied) return denied
    confirmFlowTransferSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { current, updated } = await confirmManagedFlowTransfer(params.id, operatorDisplayName(operator))
    await writeAuditLog(req, {
      action: 'CONFIRM', entityType: 'FLOW_TRANSFER', entityId: updated.id,
      entityLabel: updated.transferNo, beforeData: current, afterData: updated,
      note: '同一物料按原数量从来源库位转入目标库位，总库存与总成本不变',
    })
    return NextResponse.json({ data: updated, message: '流程转移已确认，库位库存已同步' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof FlowTransferDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Confirm flow transfer error:', error)
    return NextResponse.json({ error: '确认流程转移失败' }, { status: 500 })
  }
}
