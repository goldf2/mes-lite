import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { cancelCuttingPlan } from '@/lib/cutting'

const schema = z.object({ reason: z.string().trim().min(2).max(500) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('cuttingPlans', 'update')
    if (denied) return denied
    const input = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const plan = await prisma.$transaction((tx) => cancelCuttingPlan(tx, {
      planId: params.id,
      reason: input.reason,
      actor: {
        id: operator?.id,
        name: operator?.name || operator?.username,
      },
    }))
    await writeAuditLog(req, {
      action: 'CANCEL',
      entityType: 'CUTTING_PLAN',
      entityId: plan.id,
      entityLabel: plan.planNo,
      afterData: { status: plan.status, reason: input.reason },
    })
    return NextResponse.json({ data: plan, message: `排样方案 ${plan.planNo} 已取消，实体占用已释放` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '取消排样失败' }, { status: 400 })
  }
}
