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
  const [
    materialsWithoutStock,
    allStocks,
    activeLotBalances,
    activeLotAllocations,
    activeGenealogies,
    tracedShipments,
    activeShipmentAllocations,
    tracedReturns,
    activeReturnAllocations,
  ] = await Promise.all([
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
    prisma.shipment.findMany({
      where: { deletedAt: null, lotTraceStatus: { in: ['TRACKED', 'LEGACY'] } },
      include: { lotAllocations: { where: { status: 'ACTIVE' } } },
    }),
    prisma.shipmentLotAllocation.findMany({
      where: { status: 'ACTIVE' },
      include: {
        lot: { select: { materialId: true, status: true, lotNo: true } },
        shipment: { select: { materialId: true, shipmentNo: true, status: true } },
      },
    }),
    prisma.returnOrder.findMany({
      where: { deletedAt: null, status: 'PROCESSED', inventoryLot: { isNot: null } },
      include: { inventoryLot: true, lotAllocations: { where: { status: 'ACTIVE' } } },
    }),
    prisma.returnLotAllocation.findMany({
      where: { status: 'ACTIVE' },
      include: {
        returnOrder: { select: { returnNo: true, shipmentId: true, status: true } },
        returnedLot: { select: { id: true, returnOrderId: true, materialId: true, status: true, lotNo: true } },
        shipmentAllocation: {
          include: {
            lot: { select: { materialId: true, status: true, lotNo: true } },
            shipment: { select: { id: true, shipmentNo: true } },
          },
        },
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
    const quarantineQty = Number(stock.quarantineQty)
    const holdQty = Number(stock.holdQty)
    const reworkQty = Number(stock.reworkQty)
    const valuationQty = Number(stock.valuationQty)
    const reservedValuationQty = Number(stock.reservedValuationQty)
    const availableValuationQty = Number(stock.availableValuationQty)
    const quarantineValuationQty = Number(stock.quarantineValuationQty)
    const holdValuationQty = Number(stock.holdValuationQty)
    const reworkValuationQty = Number(stock.reworkValuationQty)
    const totalCost = Number(stock.totalCost)
    const quarantineCost = Number(stock.quarantineCost)
    const holdCost = Number(stock.holdCost)
    const reworkCost = Number(stock.reworkCost)
    const hasMaterial = Boolean(stock.materialId)
    const hasProduct = Boolean(stock.productId)
    const reasons = validateStockBalance({
      qty, reservedQty, availableQty, quarantineQty, holdQty, reworkQty, valuationQty, reservedValuationQty,
      availableValuationQty, quarantineValuationQty, holdValuationQty, reworkValuationQty,
      totalCost, quarantineCost, holdCost, reworkCost, hasMaterial, hasProduct,
      materialExists: Boolean(stock.material),
      productExists: Boolean(stock.product),
      locationBalances: stock.locationBalances.map((item) => ({
        qty: Number(item.qty), reservedQty: Number(item.reservedQty), availableQty: Number(item.availableQty),
        quarantineQty: Number(item.quarantineQty), holdQty: Number(item.holdQty), reworkQty: Number(item.reworkQty),
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
        ['REWORK', Number(location.reworkQty)],
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
  const invalidShipmentAllocations: Array<Record<string, unknown>> = []
  for (const allocation of activeShipmentAllocations) {
    const returnedQty = Number(allocation.returnedStockQty)
    if (
      allocation.lot.status !== 'OPEN'
      || allocation.shipment.status === 'PENDING'
      || Number(allocation.stockQty) <= 0
      || returnedQty < -0.000001
      || returnedQty - Number(allocation.stockQty) > 0.000001
      || (allocation.shipment.materialId && allocation.shipment.materialId !== allocation.lot.materialId)
    ) {
      invalidShipmentAllocations.push({
        id: allocation.id,
        shipmentNo: allocation.shipment.shipmentNo,
        lotNo: allocation.lot.lotNo,
        stockQty: allocation.stockQty,
        returnedStockQty: allocation.returnedStockQty,
      })
    }
  }
  for (const shipment of tracedShipments) {
    const allocatedQty = shipment.lotAllocations.reduce((sum, item) => sum + Number(item.stockQty), 0)
    if (Math.abs(allocatedQty - Number(shipment.qty)) > 0.000001) {
      invalidShipmentAllocations.push({ id: shipment.id, shipmentNo: shipment.shipmentNo, shipmentQty: shipment.qty, allocatedQty, reason: '发货批次合计与发货数量不一致' })
    }
  }
  if (invalidShipmentAllocations.length > 0) {
    issues.push({
      type: 'INVALID_SHIPMENT_LOT_ALLOCATION',
      message: '存在发货批次数量、退回累计或物料关联异常',
      records: invalidShipmentAllocations.slice(0, 20),
    })
  }
  const invalidReturnAllocations: Array<Record<string, unknown>> = []
  for (const allocation of activeReturnAllocations) {
    if (
      allocation.returnOrder.status !== 'PROCESSED'
      || allocation.returnOrder.shipmentId !== allocation.shipmentAllocation.shipment.id
      || allocation.returnedLot.returnOrderId !== allocation.returnOrderId
      || allocation.returnedLot.status !== 'OPEN'
      || allocation.shipmentAllocation.lot.status !== 'OPEN'
      || allocation.returnedLot.materialId !== allocation.shipmentAllocation.lot.materialId
      || Number(allocation.stockQty) <= 0
    ) {
      invalidReturnAllocations.push({
        id: allocation.id,
        returnNo: allocation.returnOrder.returnNo,
        shipmentNo: allocation.shipmentAllocation.shipment.shipmentNo,
        sourceLotNo: allocation.shipmentAllocation.lot.lotNo,
        returnedLotNo: allocation.returnedLot.lotNo,
      })
    }
  }
  for (const returnOrder of tracedReturns) {
    const allocatedQty = returnOrder.lotAllocations.reduce((sum, item) => sum + Number(item.stockQty), 0)
    if (
      !returnOrder.inventoryLot
      || returnOrder.inventoryLot.returnOrderId !== returnOrder.id
      || Math.abs(allocatedQty - Number(returnOrder.qty)) > 0.000001
    ) {
      invalidReturnAllocations.push({ id: returnOrder.id, returnNo: returnOrder.returnNo, returnQty: returnOrder.qty, allocatedQty, reason: '退货来源分配合计或独立退货批次关联异常' })
    }
  }
  if (invalidReturnAllocations.length > 0) {
    issues.push({
      type: 'INVALID_RETURN_LOT_ALLOCATION',
      message: '存在退货来源分配、独立退货批次或原发货关联异常',
      records: invalidReturnAllocations.slice(0, 20),
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
