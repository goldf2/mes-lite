import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import { flowTransferInputSchema } from '@/modules/production/contracts/flow-transfer-schema'
import { FlowTransferDomainError } from '@/modules/production/domain/flow-transfer-errors'
import { updateManagedFlowTransfer } from '@/modules/production/server/flow-transfer-command-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('flowTransfers', 'update')
    if (denied) return denied
    const { current, updated } = await updateManagedFlowTransfer(
      params.id,
      flowTransferInputSchema.parse(await req.json()),
    )
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'FLOW_TRANSFER', entityId: updated.id,
      entityLabel: updated.transferNo, beforeData: current, afterData: updated,
    })
    return NextResponse.json({ data: updated, message: '流程转移草稿已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof FlowTransferDomainError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Update flow transfer error:', error)
    return NextResponse.json({ error: '更新流程转移失败' }, { status: 500 })
  }
}
