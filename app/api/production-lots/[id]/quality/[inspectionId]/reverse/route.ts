import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { reverseQualityInspection } from '@/lib/production-lot'

const schema = z.object({ reason: z.string().trim().min(2).max(500) })

export async function PATCH(req: NextRequest, { params }: { params: { id: string; inspectionId: string } }) {
  try {
    const denied = await requireResourcePermission('productionLots', 'update')
    if (denied) return denied
    const { reason } = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const inspection = await prisma.$transaction((tx) => reverseQualityInspection(tx, {
      inspectionId: params.inspectionId,
      productionLotId: params.id,
      reason,
      actor: { id: operator?.id, name: operator?.name || operator?.username },
    }))
    await writeAuditLog(req, {
      action: 'REVERSE_QUALITY',
      entityType: 'PRODUCTION_LOT',
      entityId: params.id,
      entityLabel: inspection.inspectionNo,
      afterData: { status: inspection.status, reason },
    })
    return NextResponse.json({ data: inspection, message: `质检记录 ${inspection.inspectionNo} 已冲销` })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '冲销质检记录失败' }, { status: 400 })
  }
}
