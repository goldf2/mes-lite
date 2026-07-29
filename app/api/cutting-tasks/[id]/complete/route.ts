import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { completeCuttingTask } from '@/lib/cutting-execution'

const quantity = z.number().int().nonnegative()
const nonnegative = z.number().finite().nonnegative()
const schema = z.object({
  clientRequestId: z.string().min(8).max(120),
  sources: z.array(z.object({
    planSourceId: z.string().min(1),
    actualSourceLengthMm: z.number().finite().positive(),
    actualRemainingLengthMm: nonnegative,
    actualKerfLossMm: nonnegative,
    actualFixedLossMm: nonnegative,
    actualOtherLossMm: nonnegative,
    disposition: z.enum(['REUSABLE_REMNANT', 'SCRAP']),
    outputs: z.array(z.object({
      cuttingDemandId: z.string().min(1),
      goodQty: quantity,
      badQty: quantity,
      scrapQty: quantity,
      badReason: z.string().trim().max(500).optional().nullable(),
    })).min(1),
  })).min(1),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('cuttingTasks', 'update')
    if (denied) return denied
    const completion = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const task = await prisma.$transaction((tx) => completeCuttingTask(tx, {
      taskId: params.id,
      completion,
      actor: {
        id: operator?.id,
        name: operator?.name || operator?.username,
      },
    }))
    await writeAuditLog(req, {
      action: 'COMPLETE',
      entityType: 'CUTTING_TASK',
      entityId: task.id,
      entityLabel: task.taskNo,
      afterData: {
        status: task.status,
        issueStockQty: task.issueStockQty,
        remnantStockQty: task.remnantStockQty,
        sourceCount: completion.sources.length,
      },
      note: '锯切完工、原料耗用及余料回库',
    })
    return NextResponse.json({ data: task, message: `锯切任务 ${task.taskNo} 已完工` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '锯切完工失败' }, { status: 400 })
  }
}
