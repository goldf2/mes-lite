import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { generateCuttingDemandsForOrder } from '@/lib/cutting'

const schema = z.object({
  productionOrderId: z.string().min(1),
  clientRequestId: z.string().min(8).max(120),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'create')
    if (denied) return denied
    const input = schema.parse(await req.json())
    const result = await prisma.$transaction((tx) => generateCuttingDemandsForOrder(tx, input.productionOrderId))

    await writeAuditLog(req, {
      action: result.createdCount > 0 ? 'CREATE' : 'READ',
      entityType: 'CUTTING_DEMAND',
      entityId: input.productionOrderId,
      entityLabel: result.demands.map((item) => item.demandNo).join('、'),
      afterData: {
        clientRequestId: input.clientRequestId,
        demandIds: result.demands.map((item) => item.id),
        createdCount: result.createdCount,
      },
    })
    return NextResponse.json({
      data: result.demands,
      createdCount: result.createdCount,
      missingCutLength: result.missingCutLength,
      warnings: result.ruleWarnings,
      message: result.createdCount > 0
        ? `已生成 ${result.createdCount} 条切割需求`
        : '该工单切割需求已生成，本次未重复创建',
    }, { status: result.createdCount > 0 ? 201 : 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : '生成切割需求失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
