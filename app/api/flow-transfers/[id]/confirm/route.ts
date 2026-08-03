import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { getCurrentOperator } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { postInventoryLocationTransfer } from '@/lib/inventory'
import { flowTransferInclude } from '@/lib/flow-transfer'

const confirmSchema = z.object({ confirmedBy: z.string().trim().optional() })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = confirmSchema.parse(await req.json().catch(() => ({})))
    const operator = await getCurrentOperator()
    const confirmedBy = input.confirmedBy || operator?.name || operator?.username || '系统用户'
    const before = await prisma.flowTransfer.findUnique({ where: { id: params.id }, include: flowTransferInclude })
    if (!before) return NextResponse.json({ error: '流程转移记录不存在' }, { status: 404 })
    if (before.status !== 'DRAFT') return NextResponse.json({ error: '只有草稿转移可以确认' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.flowTransfer.findUnique({ where: { id: before.id } })
      if (!transfer || transfer.status !== 'DRAFT') throw new Error('转移状态已变化，请刷新后重试')
      await postInventoryLocationTransfer(tx, {
        materialId: transfer.materialId,
        stockQty: Number(transfer.quantity),
        sourceLocationId: transfer.sourceLocationId,
        targetLocationId: transfer.targetLocationId,
        refId: transfer.id,
        note: `流程转移 ${transfer.transferNo}`,
        createdBy: confirmedBy,
      })
      return tx.flowTransfer.update({
        where: { id: transfer.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy },
        include: flowTransferInclude,
      })
    })
    await writeAuditLog(req, {
      action: 'CONFIRM',
      entityType: 'FLOW_TRANSFER',
      entityId: result.id,
      entityLabel: result.transferNo,
      beforeData: before,
      afterData: result,
      note: '同一物料按原数量从来源库位转入目标库位，总库存与总成本不变',
    })
    return NextResponse.json({ data: result, message: '流程转移已确认，库位库存已同步' })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Confirm flow transfer error:', error)
    return NextResponse.json({ error: '确认流程转移失败' }, { status: 500 })
  }
}
