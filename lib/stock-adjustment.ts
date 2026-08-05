import { Prisma } from '@prisma/client'
import { changeStockLocationBalance, resolveInventoryLocation } from './inventory'
import { resolveMaterialUnits, toValuationQty } from './units'

const roundAmount = (value: number) => Number(value.toFixed(6))

export class StockAdjustmentError extends Error {}

export async function postStockLocationAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    stockId: string
    locationId: string
    newLocationQty: number
    newValuationQty?: number
    newTotalCost?: number
    reason: string
    adjustedBy: string
  },
) {
  const stock = await tx.stock.findUnique({
    where: { id: input.stockId },
    include: { material: true, product: true },
  })
  if (!stock) throw new StockAdjustmentError('库存记录不存在')
  if (stock.material?.costingMethod === 'FIFO') {
    throw new StockAdjustmentError('FIFO 物料不能直接修改库存余额，请使用来料、生产、退货或后续正式盘点单，避免库存与成本层不一致')
  }

  let location
  try {
    location = await resolveInventoryLocation(tx, input.locationId)
  } catch (error) {
    throw new StockAdjustmentError(error instanceof Error ? error.message : '所选库位不可用')
  }
  const locationBalance = await tx.stockLocationBalance.findUnique({
    where: { stockId_locationId: { stockId: stock.id, locationId: location.id } },
  })
  const oldLocationQty = Number(locationBalance?.qty || 0)
  const locationReservedQty = Number(locationBalance?.reservedQty || 0)
  if (input.newLocationQty < locationReservedQty) {
    throw new StockAdjustmentError(`调整后库位库存不能小于该库位已预留数量 ${locationReservedQty}`)
  }

  const qtyDiff = roundAmount(input.newLocationQty - oldLocationQty)
  const oldQty = Number(stock.qty)
  const targetQty = roundAmount(oldQty + qtyDiff)
  if (targetQty < Number(stock.reservedQty)) {
    throw new StockAdjustmentError('调整后总库存不能小于已预留数量')
  }

  const oldValuationQty = Number(stock.valuationQty)
  const conversionRate = stock.material ? resolveMaterialUnits(stock.material).conversionRate : 1
  const targetValuationQty = input.newValuationQty ?? toValuationQty(targetQty, conversionRate)
  if (targetValuationQty < Number(stock.reservedValuationQty)) {
    throw new StockAdjustmentError('调整后核算库存不能小于已预留核算数量')
  }

  const oldTotalCost = Number(stock.totalCost)
  const targetTotalCost = input.newTotalCost ?? oldTotalCost
  const valuationDiff = roundAmount(targetValuationQty - oldValuationQty)
  const costDiff = roundAmount(targetTotalCost - oldTotalCost)
  const valuationUnitCost = targetValuationQty > 0 ? roundAmount(targetTotalCost / targetValuationQty) : 0
  const stockUnitCost = targetQty > 0 ? roundAmount(targetTotalCost / targetQty) : 0

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: targetQty,
      availableQty: roundAmount(targetQty - Number(stock.reservedQty)),
      valuationQty: targetValuationQty,
      availableValuationQty: roundAmount(targetValuationQty - Number(stock.reservedValuationQty)),
      totalCost: targetTotalCost,
      valuationUnitCost,
      stockUnitCost,
    },
  })
  await changeStockLocationBalance(tx, {
    stockId: stock.id,
    locationId: location.id,
    qtyDelta: qtyDiff,
    availableDelta: qtyDiff,
  })
  await tx.stockLog.create({
    data: {
      stockId: stock.id,
      locationId: location.id,
      type: 'ADJUST',
      qty: qtyDiff,
      beforeQty: oldQty,
      afterQty: targetQty,
      valuationQty: valuationDiff,
      beforeValuationQty: oldValuationQty,
      afterValuationQty: targetValuationQty,
      costAmount: costDiff,
      beforeCostAmount: oldTotalCost,
      afterCostAmount: targetTotalCost,
      stockUnitSnapshot: stock.material?.stockUnit || stock.material?.unit || stock.product?.unit || '件',
      valuationUnitSnapshot: stock.material?.valuationUnit || stock.material?.unit || stock.product?.unit || '件',
      conversionRateUsed: targetQty > 0 ? roundAmount(targetValuationQty / targetQty) : 0,
      conversionSource: 'DOCUMENT_ACTUAL',
      costingMethodSnapshot: stock.material?.costingMethod || 'WEIGHTED_AVERAGE',
      refType: 'ADJUST',
      note: `存货调整: ${input.reason}`,
      createdBy: input.adjustedBy,
    },
  })

  return {
    stock,
    location,
    oldLocationQty,
    newLocationQty: input.newLocationQty,
    oldQty,
    newQty: targetQty,
    newValuationQty: targetValuationQty,
    newTotalCost: targetTotalCost,
  }
}
