import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { changeStockLocationBalance, postInventoryReceipt, type ConversionSource } from '@/lib/inventory'
import { createInventoryLotReceipt } from '@/modules/inventory'
import type { ReverseMaterialInInput } from '../contracts/material-in-schema'
import { MaterialInDomainError, runMaterialInDomainOperation } from '../domain/material-in-errors'
import { calculateMaterialInReversal, isMaterialInCostLayerUntouched } from '../domain/material-in-reversal'
import { materialReceiptInclude, toMaterialInRecord } from './material-in-service'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

async function loadReceipt(tx: Prisma.TransactionClient, id: string) {
  const receipt = await tx.materialReceipt.findUnique({ where: { id }, include: materialReceiptInclude() })
  if (!receipt || receipt.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
  if (receipt.lines.length === 0) throw new MaterialInDomainError('来料单没有物料明细')
  return receipt
}

export async function receiveManagedMaterialIn(id: string, receivedBy: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await loadReceipt(tx, id)
    assertInventoryLocationDataScope(scope, [current.stagingLocationId])
    if (current.status !== 'PENDING') throw new MaterialInDomainError('来料单状态不是待收货，无法确认收货')
    if (current.lines.some((line) => line.material.deletedAt)) throw new MaterialInDomainError('来料单包含已归档物料，无法确认收货')

    for (const line of current.lines) {
      const conversionSource: ConversionSource = line.conversionSource === 'DOCUMENT_ACTUAL'
        || line.conversionSource === 'HISTORICAL_ESTIMATE'
        || line.conversionSource === 'SAME_UNIT'
        ? line.conversionSource
        : 'MASTER_DEFAULT'
      const posted = await postInventoryReceipt(tx, {
        materialId: line.materialId,
        stockQty: Number(line.qty),
        valuationQty: Number(line.valuationQty),
        conversionSource,
        costAmount: Number(line.totalAmount),
        type: 'IN',
        refType: 'MATERIAL_IN',
        refId: line.id,
        note: `来料入库: ${current.inboundNo} 第 ${line.lineNo} 行`,
        createdBy: receivedBy,
        idempotencyKey: `MATERIAL_IN:${line.id}:RECEIVE`,
        materialInId: line.id,
        locationId: current.stagingLocationId,
      })
      const lot = await createInventoryLotReceipt(tx, {
        lotNo: `RM-${line.inboundNo}`,
        materialId: line.materialId,
        materialInId: line.id,
        sourceType: 'MATERIAL_IN',
        sourceId: line.id,
        supplierLotNo: line.batchNo,
        receivedAt: current.inboundDate,
        locationId: posted.location!.id,
        inventoryStatus: 'AVAILABLE',
        stockQty: Number(line.qty),
        valuationQty: Number(posted.quantities?.valuationQty || line.valuationQty),
        costAmount: Number(line.totalAmount),
        stockLogId: posted.movement!.id,
        idempotencyKey: `MATERIAL_IN:${line.id}:LOT_RECEIPT`,
        note: `来料单 ${current.inboundNo} 第 ${line.lineNo} 行内部批次`,
        createdBy: receivedBy,
      })
      await Promise.all([
        tx.stockLog.update({ where: { id: posted.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE', toInventoryStatus: 'AVAILABLE' } }),
        posted.costLayer ? tx.inventoryCostLayer.update({ where: { id: posted.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'AVAILABLE' } }) : Promise.resolve(),
      ])
    }

    const inboundDate = new Date()
    await tx.materialIn.updateMany({ where: { receiptId: id }, data: { status: 'RECEIVED', inboundDate, receivedBy } })
    const updated = await tx.materialReceipt.update({
      where: { id },
      data: { status: 'RECEIVED', inboundDate, receivedBy },
      include: materialReceiptInclude(),
    })
    return { current: toMaterialInRecord(current), updated: toMaterialInRecord(updated) }
  }))
}

export async function rejectManagedMaterialIn(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await loadReceipt(tx, id)
    assertInventoryLocationDataScope(scope, [current.stagingLocationId])
    if (current.status !== 'PENDING') throw new MaterialInDomainError('来料单状态不是待收货，无法拒收')
    await tx.materialIn.updateMany({ where: { receiptId: id }, data: { status: 'REJECTED' } })
    const updated = await tx.materialReceipt.update({
      where: { id }, data: { status: 'REJECTED' }, include: materialReceiptInclude(),
    })
    return { current: toMaterialInRecord(current), updated: toMaterialInRecord(updated) }
  }))
}

async function reverseMaterialInLine(
  tx: Prisma.TransactionClient,
  current: Awaited<ReturnType<typeof loadReceipt>>['lines'][number],
  receiptNo: string,
  input: ReverseMaterialInInput,
  reversedBy: string,
) {
  const stock = await tx.stock.findUnique({ where: { materialId: current.materialId } })
  if (!stock) throw new MaterialInDomainError(`物料 ${current.material.code} 的库存记录不存在，无法红冲`)
  const layer = await tx.inventoryCostLayer.findFirst({ where: { materialInId: current.id } })
  const lot = current.inventoryLot
  if (lot) {
    const [activeAllocations, activeBalance] = await Promise.all([
      tx.inventoryLotAllocation.count({ where: { lotId: lot.id, status: 'ACTIVE' } }),
      tx.inventoryLotBalance.findFirst({ where: { lotId: lot.id, inventoryStatus: 'AVAILABLE', stockQty: { gt: 0.000001 } } }),
    ])
    if (activeAllocations > 0 || !activeBalance || Math.abs(Number(activeBalance.stockQty) - Number(current.qty)) > 0.000001) {
      throw new MaterialInDomainError(`物料 ${current.material.code} 的内部批次 ${lot.lotNo} 已被生产领用或余额变动，不能整单红冲`)
    }
  }
  if (layer) {
    const activeConsumptionCount = await tx.costLayerConsumption.count({
      where: { costLayerId: layer.id, restoredAt: null },
    })
    if (!isMaterialInCostLayerUntouched(layer, activeConsumptionCount)) {
      throw new MaterialInDomainError(`物料 ${current.material.code} 的来料批次已被领料或成本层已变动，不能整单红冲`)
    }
  }

  const qty = Number(current.qty)
  const valuationQty = Number(current.valuationQty)
  const costAmount = Number(current.totalAmount)
  const reversal = calculateMaterialInReversal({
    stockQty: Number(stock.qty),
    availableQty: Number(stock.availableQty),
    valuationQty: Number(stock.valuationQty),
    availableValuationQty: Number(stock.availableValuationQty),
    totalCost: Number(stock.totalCost),
    receiptQty: qty,
    receiptValuationQty: valuationQty,
    receiptCost: costAmount,
    hasCostLayer: Boolean(layer),
  })

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: { decrement: qty }, availableQty: { decrement: qty },
      valuationQty: { decrement: valuationQty }, availableValuationQty: { decrement: valuationQty },
      totalCost: { decrement: reversal.reverseCostAmount },
      valuationUnitCost: Math.max(0, reversal.valuationUnitCost),
      stockUnitCost: Math.max(0, reversal.stockUnitCost),
    },
  })
  const { location } = await changeStockLocationBalance(tx, {
    stockId: stock.id, locationId: current.locationId, qtyDelta: -qty,
  })

  if (layer) {
    await tx.inventoryCostLayer.update({
      where: { id: layer.id },
      data: { remainingStockQty: 0, remainingValuationQty: 0, remainingAmount: 0, status: 'REVERSED' },
    })
  } else {
    await tx.inventoryCostLayer.create({
      data: {
        materialId: current.materialId, materialInId: current.id,
        stockQty: qty, remainingStockQty: 0, valuationQty, remainingValuationQty: 0,
        stockUnit: current.unit, valuationUnit: current.valuationUnit,
        valuationUnitCost: Number(current.valuationUnitCost || (valuationQty > 0 ? costAmount / valuationQty : 0)),
        stockUnitCost: Number(current.stockUnitCost || (qty > 0 ? costAmount / qty : 0)),
        totalAmount: costAmount, remainingAmount: 0, status: 'REVERSED',
      },
    })
  }

  const sourceMovement = await tx.stockLog.findFirst({
    where: { refType: 'MATERIAL_IN', refId: current.id, type: 'IN' }, orderBy: { createdAt: 'desc' },
  })
  const reversalMovement = await tx.stockLog.create({
    data: {
      stockId: stock.id, locationId: location.id, type: 'REVERSE_IN', qty: -qty,
      beforeQty: Number(stock.qty), afterQty: reversal.afterQty,
      valuationQty: -valuationQty, beforeValuationQty: Number(stock.valuationQty), afterValuationQty: reversal.afterValuationQty,
      costAmount: -reversal.reverseCostAmount, beforeCostAmount: Number(stock.totalCost), afterCostAmount: reversal.afterCostAmount,
      stockUnitSnapshot: current.unit, valuationUnitSnapshot: current.valuationUnit,
      conversionRateUsed: current.conversionRate, conversionSource: 'ORIGINAL_MOVEMENT',
      costingMethodSnapshot: current.material.costingMethod, sourceMovementId: sourceMovement?.id,
      lotId: lot?.id,
      inventoryStatus: 'AVAILABLE',
      fromInventoryStatus: 'AVAILABLE',
      idempotencyKey: `MATERIAL_IN:${current.id}:REVERSE`, refType: 'MATERIAL_IN_REVERSE', refId: current.id,
      note: `红冲来料单 ${receiptNo} 第 ${current.lineNo} 行: ${input.reason}`, createdBy: reversedBy,
    },
  })
  if (sourceMovement) {
    await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
  }
  if (lot) {
    await tx.inventoryLotBalance.updateMany({
      where: { lotId: lot.id, inventoryStatus: 'AVAILABLE' },
      data: { stockQty: 0, valuationQty: 0, costAmount: 0 },
    })
    await tx.inventoryLotTransaction.create({
      data: {
        lotId: lot.id, locationId: location.id, type: 'REVERSE_RECEIPT', fromStatus: 'AVAILABLE',
        stockQty: qty, valuationQty, costAmount: reversal.reverseCostAmount,
        refType: 'MATERIAL_IN_REVERSE', refId: current.id, stockLogId: reversalMovement.id,
        idempotencyKey: `MATERIAL_IN:${current.id}:LOT_REVERSE`,
        note: `红冲来料单 ${receiptNo} 第 ${current.lineNo} 行: ${input.reason}`, createdBy: reversedBy,
      },
    })
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { status: 'REVERSED', reversedAt: new Date(), reversedBy, reverseReason: input.reason },
    })
  }
}

export async function reverseManagedMaterialIn(id: string, input: ReverseMaterialInInput, reversedBy: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await loadReceipt(tx, id)
    assertInventoryLocationDataScope(scope, [current.stagingLocationId])
    if (current.status !== 'RECEIVED') throw new MaterialInDomainError('只有已收货来料单可以红冲')
    for (const line of current.lines) await reverseMaterialInLine(tx, line, current.inboundNo, input, reversedBy)

    const note = current.note ? `${current.note}\n红冲原因：${input.reason}` : `红冲原因：${input.reason}`
    await tx.materialIn.updateMany({ where: { receiptId: id }, data: { status: 'REVERSED', note } })
    const updated = await tx.materialReceipt.update({
      where: { id }, data: { status: 'REVERSED', note }, include: materialReceiptInclude(),
    })
    return { current: toMaterialInRecord(current), updated: toMaterialInRecord(updated) }
  }))
}
