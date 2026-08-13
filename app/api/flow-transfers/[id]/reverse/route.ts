import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentOperator, operatorDisplayName } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { reverseFlowTransferSchema } from '@/modules/production/contracts/flow-transfer-schema'
import { FlowTransferDomainError } from '@/modules/production/domain/flow-transfer-errors'
import { reverseManagedFlowTransfer } from '@/modules/production/server/flow-transfer-status-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('flowTransfers', 'update')
    if (denied) return denied
    const input = reverseFlowTransferSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    if (!operator) return NextResponse.json({ error: '请先登录' }, { status: 401 })
    const { current, updated } = await reverseManagedFlowTransfer(params.id, input, operatorDisplayName(operator))
    await writeAuditLog(req, {
      action: 'REVERSE', entityType: 'FLOW_TRANSFER', entityId: updated.id,
      entityLabel: updated.transferNo, beforeData: current, afterData: updated, note: input.reason,
    })
    return NextResponse.json({ data: updated, message: '流程转移已冲销，库位库存已恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof FlowTransferDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Reverse flow transfer error:', error)
    return NextResponse.json({ error: '冲销流程转移失败' }, { status: 500 })
  }
}
