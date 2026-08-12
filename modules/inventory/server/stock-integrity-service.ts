import { prisma } from '@/lib/prisma'
import { validateStockBalance } from '../domain/stock-integrity'

export interface StockIntegrityIssue {
  type: string
  message: string
  records: Array<Record<string, unknown>>
}

export class StockIntegrityError extends Error {
  constructor(public readonly issues: StockIntegrityIssue[]) {
    super('库存数据一致性异常，请先修复主数据与库存余额')
    this.name = 'StockIntegrityError'
  }
}

export async function findStockIntegrityIssues(): Promise<StockIntegrityIssue[]> {
  const [materialsWithoutStock, allStocks] = await Promise.all([
    prisma.material.findMany({
      where: { deletedAt: null, stock: null },
      select: { id: true, code: true, name: true },
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

  const issues: StockIntegrityIssue[] = []
  if (materialsWithoutStock.length > 0) {
    issues.push({
      type: 'MATERIAL_WITHOUT_STOCK',
      message: '存在物料档案没有对应库存余额记录',
      records: materialsWithoutStock.map((item) => ({ id: item.id, code: item.code, name: item.name })),
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
    const reasons = validateStockBalance({
      qty, reservedQty, availableQty, valuationQty, reservedValuationQty,
      availableValuationQty, totalCost, hasMaterial, hasProduct,
      materialExists: Boolean(stock.material),
      productExists: Boolean(stock.product),
      locationBalances: stock.locationBalances.map((item) => ({
        qty: Number(item.qty), reservedQty: Number(item.reservedQty), availableQty: Number(item.availableQty),
      })),
    })

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

export async function backfillMissingStockRecords() {
  return prisma.$transaction(async (tx) => {
    const materialsWithoutStock = await tx.material.findMany({
      where: { deletedAt: null, stock: null },
      select: { id: true, code: true, name: true },
    })
    for (const material of materialsWithoutStock) {
      await tx.stock.upsert({ where: { materialId: material.id }, update: {}, create: { materialId: material.id } })
    }
    return {
      materials: materialsWithoutStock.map((item) => ({ id: item.id, code: item.code, name: item.name })),
    }
  })
}
