import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { reverseDrillingReport } from '@/lib/production-lot'

const schema = z.object({ reason: z.string().trim().min(2).max(500) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string; reportId: string } }) {
  try {
    const denied = await requireResourcePermission('productionLots', 'update')
    if (denied) return denied
    const { reason } = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const report = await prisma.$transaction((tx) => reverseDrillingReport(tx, {
      reportId: params.reportId,
      productionLotId: params.id,
      reason,
      actor: { id: operator?.id, name: operator?.name || operator?.username },
    }))
    await writeAuditLog(req, {
      action: 'REVERSE_DRILLING',
      entityType: 'PRODUCTION_LOT',
      entityId: params.id,
      entityLabel: report.reportNo,
      afterData: { status: report.status, reason },
    })
    return NextResponse.json({ data: report, message: `钻孔实绩 ${report.reportNo} 已冲销` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '冲销钻孔实绩失败' }, { status: 400 })
  }
}
