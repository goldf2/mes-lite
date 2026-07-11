import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'

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
        material: { select: { id: true, code: true, name: true, spec: true, unit: true } },
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
  reason: z.string().min(1, '调整原因必填'),
  adjustedBy: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied

    const body = await req.json()
    const { stockId, newQty, reason, adjustedBy } = adjustSchema.parse(body)

    const stock = await prisma.stock.findUnique({ where: { id: stockId } })
    if (!stock) {
      return NextResponse.json({ error: '库存记录不存在' }, { status: 404 })
    }

    const oldQty = Number(stock.qty)
    const diff = newQty - oldQty

    await prisma.$transaction(async (tx) => {
      await tx.stock.update({
        where: { id: stockId },
        data: {
          qty: newQty,
          availableQty: newQty - Number(stock.reservedQty),
        },
      })

      await tx.stockLog.create({
        data: {
          stockId,
          type: 'ADJUST',
          qty: diff,
          beforeQty: oldQty,
          afterQty: newQty,
          refType: 'ADJUST',
          note: `盘点调整: ${reason}`,
          createdBy: adjustedBy,
        },
      })
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
