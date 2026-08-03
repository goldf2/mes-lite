import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { postInventoryLocationTransfer } from '@/lib/inventory'
import { flowTransferInclude } from '@/lib/flow-transfer'

const reverseSchema = z.object({
  reason: z.string().trim().min(1, '冲销原因必填'),
  reversedBy: z.string().trim().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = reverseSchema.parse(await req.json())
    const operator = await getCurrentOperator()
    const reversedBy = input.reversedBy || operator?.name || operator?.username || '系统用户'
    const before = await prisma.flowTransfer.findUnique({ where: { id: params.id }, include: flowTransferInclude })
    if (!before) return NextResponse.json({ error: '流程转移记录不存在' }, { status: 404 })
    if (before.status !== 'CONFIRMED') return NextResponse.json({ error: '只有已确认转移可以冲销' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.flowTransfer.findUnique({ where: { id: before.id } })
      if (!transfer || transfer.status !== 'CONFIRMED') throw new Error('转移状态已变化，请刷新后重试')
      await postInventoryLocationTransfer(tx, {
        materialId: transfer.materialId,
        stockQty: Number(transfer.quantity),
        sourceLocationId: transfer.targetLocationId,
        targetLocationId: transfer.sourceLocationId,
        refId: transfer.id,
        note: `冲销流程转移 ${transfer.transferNo}：${input.reason}`,
        createdBy: reversedBy,
        reverse: true,
      })
      return tx.flowTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedBy,
          reverseReason: input.reason,
        },
        include: flowTransferInclude,
      })
    })
    await writeAuditLog(req, {
      action: 'REVERSE',
      entityType: 'FLOW_TRANSFER',
      entityId: result.id,
      entityLabel: result.transferNo,
      beforeData: before,
      afterData: result,
      note: input.reason,
    })
    return NextResponse.json({ data: result, message: '流程转移已冲销，库位库存已恢复' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Reverse flow transfer error:', error)
    return NextResponse.json({ error: '冲销流程转移失败' }, { status: 500 })
  }
}
