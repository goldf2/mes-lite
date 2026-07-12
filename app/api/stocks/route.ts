import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'

// GET: 库存查询
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // 'material' | 'product'
    const keyword = searchParams.get('keyword') // 搜索关键词

    const where: any = {}
    if (type === 'material') where.materialId = { not: null }
    if (type === 'product') where.productId = { not: null }

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        material: { select: { id: true, code: true, name: true, spec: true, unit: true, stockUnit: true, valuationUnit: true, conversionRate: true } },
        product: { select: { id: true, sku: true, name: true, category: true, unit: true } },
      },
      orderBy: { id: 'asc' },
    })

    // 过滤关键词
    const filtered = keyword
      ? stocks.filter(s =>
          s.material?.name?.includes(keyword) ||
          s.material?.code?.includes(keyword) ||
          s.product?.name?.includes(keyword) ||
          s.product?.sku?.includes(keyword)
        )
      : stocks

    return NextResponse.json({ data: filtered })
  } catch (error) {
    console.error('Get stocks error:', error)
    return NextResponse.json({ error: '获取库存失败' }, { status: 500 })
  }
}

// POST: 盘点调整（需要备注原因）
import { z } from 'zod'

const adjustSchema = z.object({
  stockId: z.string().min(1),
  newQty: z.number().nonnegative(),
  newValuationQty: z.number().nonnegative().optional(),
  reason: z.string().min(1, '调整原因必填'),
  adjustedBy: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied

    const body = await req.json()
    const { stockId, newQty, reason, adjustedBy } = adjustSchema.parse(body)

    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      include: { material: true },
    })
    if (!stock) {
      return NextResponse.json({ error: '库存记录不存在' }, { status: 404 })
    }
    if (stock.material?.costingMethod === 'FIFO') {
      return NextResponse.json(
        { error: 'FIFO 物料暂不允许直接盘点调整，请通过来料入库或后续期初/盘亏单调整成本层' },
        { status: 400 }
      )
    }

    const oldQty = Number(stock.qty)
    const diff = newQty - oldQty
    const oldValuationQty = Number(stock.valuationQty)
    const conversionRate = stock.material ? resolveMaterialUnits(stock.material).conversionRate : 1
    const newValuationQty = body.newValuationQty ?? toValuationQty(newQty, conversionRate)
    const valuationDiff = newValuationQty - oldValuationQty

    await prisma.$transaction(async (tx) => {
      await tx.stock.update({
        where: { id: stockId },
        data: {
          qty: newQty,
          availableQty: newQty - Number(stock.reservedQty),
          valuationQty: newValuationQty,
          availableValuationQty: newValuationQty - Number(stock.reservedValuationQty),
        },
      })

      await tx.stockLog.create({
        data: {
          stockId,
          type: 'ADJUST',
          qty: diff,
          beforeQty: oldQty,
          afterQty: newQty,
          valuationQty: valuationDiff,
          beforeValuationQty: oldValuationQty,
          afterValuationQty: newValuationQty,
          refType: 'ADJUST',
          note: `盘点调整: ${reason}`,
          createdBy: adjustedBy,
        },
      })
    })

    await writeAuditLog(req, {
      action: 'ADJUST',
      entityType: 'STOCK',
      entityId: stock.id,
      entityLabel: stock.material?.code || stock.productId || stock.id,
      beforeData: stock,
      afterData: { newQty, newValuationQty, reason, adjustedBy },
    })

    return NextResponse.json({ success: true, message: '库存调整完成' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: '库存调整失败' }, { status: 500 })
  }
}
