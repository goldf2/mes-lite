import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { reportDrilling } from '@/lib/production-lot'

const quantity = z.number().int().nonnegative()
const schema = z.object({
  clientRequestId: z.string().min(8).max(120),
  operationType: z.enum(['INITIAL', 'REWORK']),
  inputQty: z.number().int().positive(),
  goodQty: quantity,
  reworkQty: quantity,
  scrapQty: quantity,
  holeType: z.string().trim().max(200).optional().nullable(),
  drawingNo: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('productionLots', 'create')
    if (denied) return denied
    const body = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const report = await prisma.$transaction((tx) => reportDrilling(tx, {
      productionLotId: params.id,
      ...body,
      actor: { id: operator?.id, name: operator?.name || operator?.username },
    }))
    await writeAuditLog(req, {
      action: 'DRILLING_REPORT',
      entityType: 'PRODUCTION_LOT',
      entityId: params.id,
      entityLabel: report.reportNo,
      afterData: report,
    })
    return NextResponse.json({ data: report, message: `钻孔实绩 ${report.reportNo} 已确认` }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '钻孔报工失败' }, { status: 400 })
  }
}
