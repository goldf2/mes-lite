import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { reverseCuttingTask } from '@/lib/cutting-execution'

const schema = z.object({ reason: z.string().trim().min(2).max(500) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('cuttingTasks', 'update')
    if (denied) return denied
    const { reason } = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const task = await prisma.$transaction((tx) => reverseCuttingTask(tx, {
      taskId: params.id,
      reason,
      actor: {
        id: operator?.id,
        name: operator?.name || operator?.username,
      },
    }))
    await writeAuditLog(req, {
      action: 'REVERSE',
      entityType: 'CUTTING_TASK',
      entityId: task.id,
      entityLabel: task.taskNo,
      afterData: { status: task.status, reason },
      note: '冲销锯切实绩并恢复库存、实体和成本层',
    })
    return NextResponse.json({ data: task, message: `锯切任务 ${task.taskNo} 已冲销` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '冲销锯切任务失败' }, { status: 400 })
  }
}
