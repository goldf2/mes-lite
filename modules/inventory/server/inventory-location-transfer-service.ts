import type { Prisma } from '@prisma/client'
import { createInventoryReversalMovement } from '@/lib/inventory-ledger'
import {
  changeStockLocationBalance,
  getMaterialPolicy,
  resolveInventoryLocation,
  roundQty,
  tolerance,
} from './inventory-posting-service'

export async function postInventoryLocationTransfer(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    stockQty: number
    sourceLocationId: string
    targetLocationId: string
    refId: string
    note: string
    createdBy?: string | null
    reverse?: boolean
  },
) {
  if (!Number.isFinite(input.stockQty) || input.stockQty <= 0) throw new Error('转移数量必须大于 0')
  if (input.sourceLocationId === input.targetLocationId) throw new Error('来源库位和目标库位不能相同')

  const material = await getMaterialPolicy(tx, input.materialId)
  const stock = await tx.stock.findUnique({ where: { materialId: material.id } })
  if (!stock) throw new Error(`物料 ${material.code} ${material.name} 没有库存记录`)

  const [sourceLocation, targetLocation] = await Promise.all([
    resolveInventoryLocation(tx, input.sourceLocationId),
    resolveInventoryLocation(tx, input.targetLocationId),
  ])
  const reverseSources = input.reverse ? await Promise.all([
    tx.stockLog.findFirst({
      where: {
        stockId: stock.id, locationId: sourceLocation.id, refType: 'FLOW_TRANSFER', refId: input.refId,
        type: 'FLOW_TRANSFER_IN',
      },
      orderBy: { createdAt: 'desc' },
    }),
    tx.stockLog.findFirst({
      where: {
        stockId: stock.id, locationId: targetLocation.id, refType: 'FLOW_TRANSFER', refId: input.refId,
        type: 'FLOW_TRANSFER_OUT',
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]) : null
  if (reverseSources && (!reverseSources[0] || !reverseSources[1])) {
    throw new Error('原流程转移库存流水缺失，不能建立可信冲销')
  }
  const transferQty = roundQty(input.stockQty)
  const sourceBalance = await tx.stockLocationBalance.findUnique({
    where: { stockId_locationId: { stockId: stock.id, locationId: sourceLocation.id } },
  })
  if (!sourceBalance || Number(sourceBalance.availableQty) + tolerance < transferQty) {
    throw new Error(
      `物料 ${material.code} ${material.name} 在库位 ${sourceLocation.code} ${sourceLocation.name} 库存不足：可用 ${sourceBalance?.availableQty || 0} ${material.stockUnit}，需 ${transferQty} ${material.stockUnit}`,
    )
  }

  const sourceResult = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: sourceLocation.id,
    qtyDelta: -transferQty,
  })
  const targetResult = await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: targetLocation.id,
    qtyDelta: transferQty,
  })

  const totalQty = Number(stock.qty)
  const totalValuationQty = Number(stock.valuationQty)
  const totalCost = Number(stock.totalCost)
  const typePrefix = input.reverse ? 'FLOW_TRANSFER_REVERSE' : 'FLOW_TRANSFER'
  const common = {
    stockId: stock.id,
    beforeQty: totalQty,
    afterQty: totalQty,
    beforeValuationQty: totalValuationQty,
    afterValuationQty: totalValuationQty,
    beforeCostAmount: totalCost,
    afterCostAmount: totalCost,
    stockUnitSnapshot: material.stockUnit,
    valuationUnitSnapshot: material.valuationUnit,
    conversionRateUsed: material.conversionRate,
    conversionSource: 'ORIGINAL_MOVEMENT',
    costingMethodSnapshot: material.costingMethod,
    refType: 'FLOW_TRANSFER',
    refId: input.refId,
    note: input.note,
    createdBy: input.createdBy || null,
  }
  const outgoingData = {
    ...common,
    locationId: sourceLocation.id,
    type: `${typePrefix}_OUT`,
    qty: -transferQty,
    valuationQty: 0,
    costAmount: 0,
  }
  const outgoing = reverseSources
    ? await createInventoryReversalMovement(tx, reverseSources[0]!.id, outgoingData)
    : await tx.stockLog.create({ data: outgoingData })
  const incomingData = {
    ...common,
    locationId: targetLocation.id,
    type: `${typePrefix}_IN`,
    qty: transferQty,
    valuationQty: 0,
    costAmount: 0,
  }
  const incoming = reverseSources
    ? await createInventoryReversalMovement(tx, reverseSources[1]!.id, incomingData)
    : await tx.stockLog.create({ data: { ...incomingData, sourceMovementId: outgoing.id } })

  return {
    material,
    stock,
    sourceLocation,
    targetLocation,
    sourceBalance: sourceResult.balance,
    targetBalance: targetResult.balance,
    outgoing,
    incoming,
  }
}
