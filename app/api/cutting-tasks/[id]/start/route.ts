import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { startCuttingTask } from '@/lib/cutting-execution'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('cuttingTasks', 'update')
    if (denied) return denied
    const operator = await getCurrentOperator()
    const task = await prisma.$transaction((tx) => startCuttingTask(tx, {
      taskId: params.id,
      actor: {
        id: operator?.id,
        name: operator?.name || operator?.username,
      },
    }))
    await writeAuditLog(req, {
      action: 'START',
      entityType: 'CUTTING_TASK',
      entityId: task.id,
      entityLabel: task.taskNo,
      afterData: { status: task.status, startedAt: task.startedAt },
    })
    return NextResponse.json({ data: task, message: `锯切任务 ${task.taskNo} 已开工` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '锯切任务开工失败' }, { status: 400 })
  }
}
