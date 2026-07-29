import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { recordQualityInspection } from '@/lib/production-lot'

const quantity = z.number().int().nonnegative()
const schema = z.object({
  clientRequestId: z.string().min(8).max(120),
  sourceBucket: z.enum(['QC_PENDING', 'REWORK_PENDING']),
  inputQty: z.number().int().positive(),
  sampleQty: z.number().int().positive(),
  passedQty: quantity,
  reworkQty: quantity,
  scrapQty: quantity,
  badReason: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('productionLots', 'create')
    if (denied) return denied
    const body = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const inspection = await prisma.$transaction((tx) => recordQualityInspection(tx, {
      productionLotId: params.id,
      ...body,
      actor: { id: operator?.id, name: operator?.name || operator?.username },
    }))
    await writeAuditLog(req, {
      action: 'QUALITY_INSPECTION',
      entityType: 'PRODUCTION_LOT',
      entityId: params.id,
      entityLabel: inspection.inspectionNo,
      afterData: inspection,
    })
    return NextResponse.json({ data: inspection, message: `质检记录 ${inspection.inspectionNo} 已确认` }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '质检提交失败' }, { status: 400 })
  }
}
