import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { resolveMaterialUnits, toValuationQty } from '@/lib/units'
import { parseCsvFilter } from '@/lib/status-filter'

const STOCK_BALANCE_FIELDS = [
  'qty',
  'reservedQty',
  'availableQty',
  'valuationQty',
  'reservedValuationQty',
  'availableValuationQty',
  'totalCost',
] as const

function hasStockBalance(stock: Record<string, unknown>) {
  return STOCK_BALANCE_FIELDS.some((field) => Math.abs(Number(stock[field] || 0)) > 0.000001)
}

// GET: 库存查询
export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'read')
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // 'material' | 'product'
    const keyword = searchParams.get('keyword') // 搜索关键词
    const category = searchParams.get('category')
    const categories = parseCsvFilter(searchParams.get('categories'))
    const customerId = searchParams.get('customerId')
    const includeInvalid = searchParams.get('includeInvalid') === '1'

    const where: any = {}
    const materialWhere: any = {}
    const productWhere: any = {}
    if (type === 'material') where.materialId = { not: null }
    if (type === 'product') where.productId = { not: null }
    if (categories.length === 1) {
      materialWhere.category = categories[0]
    } else if (categories.length > 1) {
      materialWhere.category = { in: categories }
    } else if (category) {
      materialWhere.category = category
    }
    if (customerId === '__UNASSIGNED__') {
      materialWhere.customerId = null
      productWhere.customerId = null
    } else if (customerId) {
      materialWhere.customerId = customerId
      productWhere.customerId = customerId
    }

    const hasMaterialFilter = Object.keys(materialWhere).length > 0
    const hasProductFilter = Object.keys(productWhere).length > 0
    if (type === 'material' && hasMaterialFilter) {
      where.material = { is: materialWhere }
    } else if (type === 'product' && hasProductFilter) {
      where.product = { is: productWhere }
    } else if (hasMaterialFilter && hasProductFilter && !category && categories.length === 0) {
      where.OR = [
        { material: { is: materialWhere } },
        { product: { is: productWhere } },
      ]
    } else if (hasMaterialFilter) {
      where.material = { is: materialWhere }
    } else if (hasProductFilter) {
      where.product = { is: productWhere }
    }

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        material: { select: { id: true, code: true, name: true, spec: true, category: true, customerId: true, customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true, valuationUnit: true, conversionRate: true, deletedAt: true } },
        product: { select: { id: true, sku: true, name: true, category: true, customerId: true, customer: { select: { id: true, code: true, name: true } }, unit: true } },
      },
      orderBy: { id: 'asc' },
    })

    // 过滤关键词
    const visibleStocks = includeInvalid ? stocks : stocks.filter((stock) => !stock.material?.deletedAt || hasStockBalance(stock))

    const filtered = keyword
      ? visibleStocks.filter(s =>
          s.material?.name?.includes(keyword) ||
          s.material?.code?.includes(keyword) ||
          s.product?.name?.includes(keyword) ||
          s.product?.sku?.includes(keyword)
        )
      : visibleStocks

    return NextResponse.json({ data: filtered })
  } catch (error) {
    console.error('Get stocks error:', error)
    return NextResponse.json({ error: '获取库存失败' }, { status: 500 })
  }
}

// POST: 存货调整（需要备注原因）
import { z } from 'zod'

const adjustSchema = z.object({
  stockId: z.string().min(1),
  newQty: z.number().nonnegative(),
  newValuationQty: z.number().nonnegative().optional(),
  newTotalCost: z.number().nonnegative().optional(),
  reason: z.string().min(1, '调整原因必填'),
  adjustedBy: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied

    const body = await req.json()
    const { stockId, newQty, newValuationQty, newTotalCost, reason, adjustedBy } = adjustSchema.parse(body)

    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      include: { material: true },
    })
    if (!stock) {
      return NextResponse.json({ error: '库存记录不存在' }, { status: 404 })
    }

    const oldQty = Number(stock.qty)
    const diff = newQty - oldQty
    const oldValuationQty = Number(stock.valuationQty)
    const conversionRate = stock.material ? resolveMaterialUnits(stock.material).conversionRate : 1
    const targetValuationQty = newValuationQty ?? toValuationQty(newQty, conversionRate)
    const valuationDiff = targetValuationQty - oldValuationQty
    const oldTotalCost = Number(stock.totalCost)
    const targetTotalCost = newTotalCost ?? oldTotalCost
    const costDiff = Number((targetTotalCost - oldTotalCost).toFixed(6))

    if (newQty < Number(stock.reservedQty)) {
      return NextResponse.json({ error: '调整后库存不能小于已预留数量' }, { status: 400 })
    }
    if (targetValuationQty < Number(stock.reservedValuationQty)) {
      return NextResponse.json({ error: '调整后核算库存不能小于已预留核算数量' }, { status: 400 })
    }

    const valuationUnitCost = targetValuationQty > 0 ? Number((targetTotalCost / targetValuationQty).toFixed(6)) : 0
    const stockUnitCost = newQty > 0 ? Number((targetTotalCost / newQty).toFixed(6)) : 0

    await prisma.$transaction(async (tx) => {
      await tx.stock.update({
        where: { id: stockId },
        data: {
          qty: newQty,
          availableQty: newQty - Number(stock.reservedQty),
          valuationQty: targetValuationQty,
          availableValuationQty: targetValuationQty - Number(stock.reservedValuationQty),
          totalCost: targetTotalCost,
          valuationUnitCost,
          stockUnitCost,
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
          afterValuationQty: targetValuationQty,
          costAmount: costDiff,
          beforeCostAmount: oldTotalCost,
          afterCostAmount: targetTotalCost,
          refType: 'ADJUST',
          note: `存货调整: ${reason}`,
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
      afterData: { newQty, newValuationQty: targetValuationQty, newTotalCost: targetTotalCost, reason, adjustedBy },
    })

    return NextResponse.json({ success: true, message: '存货调整完成' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: '存货调整失败' }, { status: 500 })
  }
}
