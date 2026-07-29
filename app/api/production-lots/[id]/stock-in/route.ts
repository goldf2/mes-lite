import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { stockInProductionLot } from '@/lib/production-lot'

const schema = z.object({
  clientRequestId: z.string().min(8).max(120),
  qty: z.number().int().positive(),
  batchNo: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireResourcePermission('productionLots', 'create')
    if (denied) return denied
    const body = schema.parse(await req.json())
    const operator = await getCurrentOperator()
    const stockIn = await prisma.$transaction((tx) => stockInProductionLot(tx, {
      productionLotId: params.id,
      ...body,
      actor: { id: operator?.id, name: operator?.name || operator?.username },
    }))
    await writeAuditLog(req, {
      action: 'PRODUCTION_LOT_STOCK_IN',
      entityType: 'PRODUCTION_LOT',
      entityId: params.id,
      entityLabel: stockIn.batchNo || stockIn.id,
      afterData: stockIn,
    })
    return NextResponse.json({ data: stockIn, message: `质检合格品已入库 ${stockIn.qty} 件` }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : '成品入库失败' }, { status: 400 })
  }
}
