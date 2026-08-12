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
  const [materialsWithoutStock, allStocks, activeLotBalances, activeLotAllocations, activeGenealogies] = await Promise.all([
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
    prisma.inventoryLotBalance.findMany({
      where: { lot: { status: 'OPEN' }, stockQty: { gt: 0.000001 } },
      include: { lot: { select: { id: true, lotNo: true, materialId: true } }, location: { select: { code: true } } },
    }),
    prisma.inventoryLotAllocation.findMany({
      where: { status: 'ACTIVE' }, include: { lot: { select: { materialId: true, status: true, lotNo: true } }, actualInput: { select: { materialId: true, actualId: true } } },
    }),
    prisma.inventoryLotGenealogy.findMany({
      where: { status: 'ACTIVE' }, include: { parentLot: { select: { materialId: true, status: true } }, childLot: { select: { status: true } }, inputAllocation: { select: { status: true } } },
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
    const quarantineQty = Number(stock.quarantineQty)
    const holdQty = Number(stock.holdQty)
    const valuationQty = Number(stock.valuationQty)
    const reservedValuationQty = Number(stock.reservedValuationQty)
    const availableValuationQty = Number(stock.availableValuationQty)
    const quarantineValuationQty = Number(stock.quarantineValuationQty)
    const holdValuationQty = Number(stock.holdValuationQty)
    const totalCost = Number(stock.totalCost)
    const quarantineCost = Number(stock.quarantineCost)
    const holdCost = Number(stock.holdCost)
    const hasMaterial = Boolean(stock.materialId)
    const hasProduct = Boolean(stock.productId)
    const reasons = validateStockBalance({
      qty, reservedQty, availableQty, quarantineQty, holdQty, valuationQty, reservedValuationQty,
      availableValuationQty, quarantineValuationQty, holdValuationQty,
      totalCost, quarantineCost, holdCost, hasMaterial, hasProduct,
      materialExists: Boolean(stock.material),
      productExists: Boolean(stock.product),
      locationBalances: stock.locationBalances.map((item) => ({
        qty: Number(item.qty), reservedQty: Number(item.reservedQty), availableQty: Number(item.availableQty),
        quarantineQty: Number(item.quarantineQty), holdQty: Number(item.holdQty),
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
  const invalidLotBalances: Array<Record<string, unknown>> = []
  const balanceSums = new Map<string, number>()
  for (const balance of activeLotBalances) {
    if (Number(balance.stockQty) < -0.000001 || Number(balance.valuationQty) < -0.000001 || Number(balance.costAmount) < -0.000001) {
      invalidLotBalances.push({ id: balance.id, lotNo: balance.lot.lotNo, location: balance.location.code, reason: '批次余额不能为负数' })
    }
    const key = `${balance.lot.materialId}:${balance.locationId}:${balance.inventoryStatus}`
    balanceSums.set(key, Number((Number(balanceSums.get(key) || 0) + Number(balance.stockQty)).toFixed(6)))
  }
  for (const stock of allStocks) {
    if (!stock.materialId) continue
    for (const location of stock.locationBalances) {
      for (const [status, expected] of [
        ['AVAILABLE', Number(location.availableQty)],
        ['QUARANTINE', Number(location.quarantineQty)],
        ['HOLD', Number(location.holdQty)],
      ] as const) {
        const tracked = Number(balanceSums.get(`${stock.materialId}:${location.locationId}:${status}`) || 0)
        if (tracked - expected > 0.000001) {
          invalidLotBalances.push({ materialId: stock.materialId, locationId: location.locationId, status, tracked, expected, reason: '有效批次余额大于对应库位状态余额' })
        }
      }
    }
  }
  if (invalidLotBalances.length > 0) {
    issues.push({ type: 'INVALID_INVENTORY_LOT_BALANCE', message: '存在内部批次余额负数或大于库位状态余额', records: invalidLotBalances.slice(0, 20) })
  }
  const invalidAllocations = activeLotAllocations.filter((allocation) => (
    allocation.lot.status !== 'OPEN'
    || allocation.lot.materialId !== allocation.actualInput.materialId
    || Number(allocation.stockQty) <= 0
  ))
  if (invalidAllocations.length > 0) {
    issues.push({
      type: 'INVALID_INVENTORY_LOT_ALLOCATION',
      message: '存在有效投入分配关联已冲销批次、错误物料或非正数量',
      records: invalidAllocations.slice(0, 20).map((item) => ({ id: item.id, lotNo: item.lot.lotNo, actualId: item.actualInput.actualId })),
    })
  }
  const invalidGenealogies = activeGenealogies.filter((genealogy) => (
    genealogy.parentLot.status !== 'OPEN'
    || genealogy.childLot.status !== 'OPEN'
    || genealogy.inputAllocation.status !== 'ACTIVE'
  ))
  if (invalidGenealogies.length > 0) {
    issues.push({
      type: 'INVALID_INVENTORY_LOT_GENEALOGY',
      message: '存在有效谱系边关联已冲销批次或已冲销投入分配',
      records: invalidGenealogies.slice(0, 20).map((item) => ({ id: item.id, parentLotId: item.parentLotId, childLotId: item.childLotId })),
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
