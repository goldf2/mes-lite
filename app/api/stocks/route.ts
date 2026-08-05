import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireResourcePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { parseCsvFilter } from '@/lib/status-filter'
import { postStockLocationAdjustment, StockAdjustmentError } from '@/lib/stock-adjustment'

const STOCK_BALANCE_FIELDS = [
  'qty',
  'reservedQty',
  'availableQty',
  'valuationQty',
  'reservedValuationQty',
  'availableValuationQty',
  'totalCost',
] as const

const BALANCE_TOLERANCE = 0.000001

function hasStockBalance(stock: Record<string, unknown>) {
  return STOCK_BALANCE_FIELDS.some((field) => Math.abs(Number(stock[field] || 0)) > BALANCE_TOLERANCE)
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= BALANCE_TOLERANCE
}

async function findStockIntegrityIssues() {
  const [materialsWithoutStock, productsWithoutStock, allStocks] = await Promise.all([
    prisma.material.findMany({
      where: { deletedAt: null, stock: null },
      select: { id: true, code: true, name: true },
      take: 20,
    }),
    prisma.product.findMany({
      where: { stock: null },
      select: { id: true, sku: true, name: true },
      take: 20,
    }),
    prisma.stock.findMany({
      include: {
        material: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true } },
        locationBalances: true,
      },
    }),
  ])

  const issues: Array<{ type: string; message: string; records: Array<Record<string, unknown>> }> = []

  if (materialsWithoutStock.length > 0) {
    issues.push({
      type: 'MATERIAL_WITHOUT_STOCK',
      message: '存在物料档案没有对应库存余额记录',
      records: materialsWithoutStock.map((item) => ({ id: item.id, code: item.code, name: item.name })),
    })
  }

  if (productsWithoutStock.length > 0) {
    issues.push({
      type: 'PRODUCT_WITHOUT_STOCK',
      message: '存在内部兼容物料没有对应库存余额记录',
      records: productsWithoutStock.map((item) => ({ id: item.id, code: item.sku, name: item.name })),
    })
  }

  const invalidStocks: Array<Record<string, unknown>> = []
  for (const stock of allStocks) {
    const qty = Number(stock.qty)
    const reservedQty = Number(stock.reservedQty)
    const availableQty = Number(stock.availableQty)
    const valuationQty = Number(stock.valuationQty)
    const reservedValuationQty = Number(stock.reservedValuationQty)
    const availableValuationQty = Number(stock.availableValuationQty)
    const totalCost = Number(stock.totalCost)
    const hasMaterial = Boolean(stock.materialId)
    const hasProduct = Boolean(stock.productId)
    const reasons: string[] = []

    if (hasMaterial === hasProduct) reasons.push('库存记录必须且只能关联一个物料或内部兼容物料')
    if (hasMaterial && !stock.material) reasons.push('库存关联的物料档案不存在')
    if (hasProduct && !stock.product) reasons.push('库存关联的内部兼容物料不存在')
    if (qty < -BALANCE_TOLERANCE || reservedQty < -BALANCE_TOLERANCE || availableQty < -BALANCE_TOLERANCE) reasons.push('库存数量不能为负数')
    if (valuationQty < -BALANCE_TOLERANCE || reservedValuationQty < -BALANCE_TOLERANCE || availableValuationQty < -BALANCE_TOLERANCE) reasons.push('核算库存不能为负数')
    if (totalCost < -BALANCE_TOLERANCE) reasons.push('库存金额不能为负数')
    if (reservedQty - qty > BALANCE_TOLERANCE) reasons.push('预留库存不能大于库存')
    if (reservedValuationQty - valuationQty > BALANCE_TOLERANCE) reasons.push('预留核算库存不能大于核算库存')
    if (!closeEnough(availableQty, qty - reservedQty)) reasons.push('可用库存必须等于库存减预留')
    if (!closeEnough(availableValuationQty, valuationQty - reservedValuationQty)) reasons.push('可用核算库存必须等于核算库存减预留核算库存')
    const locationQty = stock.locationBalances.reduce((sum, item) => sum + Number(item.qty), 0)
    const locationReservedQty = stock.locationBalances.reduce((sum, item) => sum + Number(item.reservedQty), 0)
    const locationAvailableQty = stock.locationBalances.reduce((sum, item) => sum + Number(item.availableQty), 0)
    if (!closeEnough(locationQty, qty)) reasons.push('各库位库存合计必须等于物料总库存')
    if (!closeEnough(locationReservedQty, reservedQty)) reasons.push('各库位占用合计必须等于物料总占用')
    if (!closeEnough(locationAvailableQty, availableQty)) reasons.push('各库位可用合计必须等于物料总可用')
    if (stock.locationBalances.some((item) =>
      Number(item.qty) < -BALANCE_TOLERANCE
      || Number(item.reservedQty) < -BALANCE_TOLERANCE
      || !closeEnough(Number(item.availableQty), Number(item.qty) - Number(item.reservedQty)),
    )) reasons.push('库位余额存在负数或可用数量不一致')

    if (reasons.length > 0) {
      invalidStocks.push({
        id: stock.id,
        code: stock.material?.code || stock.product?.sku || stock.materialId || stock.productId || stock.id,
        name: stock.material?.name || stock.product?.name || '',
        reasons,
      })
    }
  }

  if (invalidStocks.length > 0) {
    issues.push({
      type: 'INVALID_STOCK_BALANCE',
      message: '存在库存余额数量或关联关系异常',
      records: invalidStocks.slice(0, 20),
    })
  }

  return issues
}

async function backfillMissingStockRecords() {
  return prisma.$transaction(async (tx) => {
    const [materialsWithoutStock, productsWithoutStock] = await Promise.all([
      tx.material.findMany({
        where: { deletedAt: null, stock: null },
        select: { id: true, code: true, name: true },
      }),
      tx.product.findMany({
        where: { stock: null },
        select: { id: true, sku: true, name: true },
      }),
    ])

    for (const material of materialsWithoutStock) {
      await tx.stock.upsert({
        where: { materialId: material.id },
        update: {},
        create: { materialId: material.id },
      })
    }

    for (const product of productsWithoutStock) {
      await tx.stock.upsert({
        where: { productId: product.id },
        update: {},
        create: { productId: product.id },
      })
    }

    return {
      materials: materialsWithoutStock.map((item) => ({ id: item.id, code: item.code, name: item.name })),
      products: productsWithoutStock.map((item) => ({ id: item.id, code: item.sku, name: item.name })),
    }
  })
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
    const integrityIssues = await findStockIntegrityIssues()
    if (integrityIssues.length > 0) {
      return NextResponse.json(
        {
          error: '库存数据一致性异常，请先修复主数据与库存余额',
          issues: integrityIssues,
        },
        { status: 409 }
      )
    }

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
        locationBalances: {
          include: { location: { select: { id: true, code: true, name: true, isActive: true } } },
          orderBy: { location: { code: 'asc' } },
        },
      },
      orderBy: { id: 'asc' },
    })

    const materialIds = stocks
      .map((stock) => stock.materialId)
      .filter(Boolean) as string[]
    const images = materialIds.length === 0 ? [] : await prisma.documentAttachment.findMany({
      where: {
        ownerType: 'MATERIAL',
        ownerId: { in: materialIds },
        documentType: 'MATERIAL_IMAGE',
        mimeType: { startsWith: 'image/' },
        deletedAt: null,
      },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true },
    })
    const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
    for (const image of images) {
      if (!primaryImageByMaterial.has(image.ownerId)) {
        primaryImageByMaterial.set(image.ownerId, image)
      }
    }
    const stocksWithImages = stocks.map((stock) => {
      const image = stock.materialId ? primaryImageByMaterial.get(stock.materialId) : null
      return {
        ...stock,
        material: stock.material ? {
          ...stock.material,
          primaryImage: image ? {
            id: image.id,
            url: `/api/attachments/${image.id}/file`,
            note: image.note,
            mimeType: image.mimeType,
            isCover: image.isCover,
          } : null,
        } : null,
      }
    })

    // 过滤关键词
    const visibleStocks = (includeInvalid ? stocksWithImages : stocksWithImages.filter((stock) => !stock.material?.deletedAt || hasStockBalance(stock)))
      .filter((stock) => stock.material || hasStockBalance(stock))

    const normalizedKeyword = keyword?.trim().toLocaleLowerCase('zh-CN')
    const filtered = normalizedKeyword
      ? visibleStocks.filter(s =>
          [
            s.material?.name,
            s.material?.code,
            s.product?.name,
            s.product?.sku,
          ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedKeyword))
        )
      : visibleStocks

    return NextResponse.json({ data: filtered })
  } catch (error) {
    console.error('Get stocks error:', error)
    return NextResponse.json({ error: '获取库存失败' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('stocks', 'update')
    if (denied) return denied

    const result = await backfillMissingStockRecords()
    await writeAuditLog(req, {
      action: 'REPAIR',
      entityType: 'STOCK',
      entityLabel: '库存余额补齐',
      afterData: result,
      note: '补齐缺失的物料和内部兼容物料 0 库存余额记录',
    })

    return NextResponse.json({
      message: `库存余额已补齐：物料 ${result.materials.length} 条，内部兼容物料 ${result.products.length} 条`,
      data: result,
    })
  } catch (error) {
    console.error('Repair stock records error:', error)
    return NextResponse.json({ error: '补齐库存余额失败' }, { status: 500 })
  }
}

// POST: 按库位进行存货调整（需要备注原因）
const adjustSchema = z.object({
  stockId: z.string().min(1),
  locationId: z.string().min(1, '库位必填'),
  newLocationQty: z.number().nonnegative(),
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
    const input = adjustSchema.parse(body)
    const result = await prisma.$transaction((tx) => postStockLocationAdjustment(tx, input))

    await writeAuditLog(req, {
      action: 'ADJUST',
      entityType: 'STOCK',
      entityId: result.stock.id,
      entityLabel: result.stock.material?.code || result.stock.product?.sku || result.stock.id,
      beforeData: result.stock,
      afterData: {
        locationId: result.location.id,
        location: `${result.location.code} ${result.location.name}`,
        oldLocationQty: result.oldLocationQty,
        newLocationQty: result.newLocationQty,
        newQty: result.newQty,
        newValuationQty: result.newValuationQty,
        newTotalCost: result.newTotalCost,
        reason: input.reason,
        adjustedBy: input.adjustedBy,
      },
    })

    return NextResponse.json({ success: true, message: '存货调整完成' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: error.errors }, { status: 400 })
    }
    if (error instanceof StockAdjustmentError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Adjust stock error:', error)
    return NextResponse.json({ error: '存货调整失败' }, { status: 500 })
  }
}
