import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import {
  flowTransferInclude,
  flowTransferInputSchema,
  parseFlowTransferDate,
  resolveFlowTransferDraft,
} from '@/lib/flow-transfer'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('stats', 'update')
    if (denied) return denied

    const input = flowTransferInputSchema.parse(await req.json())
    const existing = await prisma.flowTransfer.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: '流程转移记录不存在' }, { status: 404 })
    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: '只有草稿转移可以修改；已确认转移请先冲销' }, { status: 400 })
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const { material } = await resolveFlowTransferDraft(tx, input)
      return tx.flowTransfer.update({
        where: { id: existing.id },
        data: {
          transferDate: parseFlowTransferDate(input.transferDate),
          materialId: material.id,
          sourceLocationId: input.sourceLocationId,
          targetLocationId: input.targetLocationId,
          quantity: input.quantity,
          unit: material.stockUnit || material.unit,
          operator: input.operator,
          note: input.note || null,
        },
        include: flowTransferInclude,
      })
    })
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'FLOW_TRANSFER',
      entityId: transfer.id,
      entityLabel: transfer.transferNo,
      beforeData: existing,
      afterData: transfer,
    })
    return NextResponse.json({ data: transfer, message: '流程转移草稿已更新' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Update flow transfer error:', error)
    return NextResponse.json({ error: '更新流程转移失败' }, { status: 500 })
  }
}
