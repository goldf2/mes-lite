import { prisma } from '@/lib/prisma'
import { changeStockLocationBalance, postInventoryReceipt } from '@/lib/inventory'
import type { ReverseMaterialInInput } from '../contracts/material-in-schema'
import { MaterialInDomainError, runMaterialInDomainOperation } from '../domain/material-in-errors'
import { calculateMaterialInReversal, isMaterialInCostLayerUntouched } from '../domain/material-in-reversal'

export async function receiveManagedMaterialIn(id: string) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.materialIn.findUnique({ where: { id }, include: { material: true } })
    if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
    if (current.material.deletedAt) throw new MaterialInDomainError('物料已归档，无法确认收货')
    if (current.status !== 'PENDING') throw new MaterialInDomainError('来料单状态不是待收货，无法确认收货')
    await postInventoryReceipt(tx, {
      materialId: current.materialId,
      stockQty: Number(current.qty),
      valuationQty: Number(current.valuationQty),
      conversionSource: current.conversionSource === 'DOCUMENT_ACTUAL' ? 'DOCUMENT_ACTUAL' : 'MASTER_DEFAULT',
      costAmount: Number(current.totalAmount),
      type: 'IN',
      refType: 'MATERIAL_IN',
      refId: id,
      note: `来料入库: ${current.inboundNo}`,
      idempotencyKey: `MATERIAL_IN:${id}:RECEIVE`,
      materialInId: id,
      locationId: current.locationId,
    })
    const updated = await tx.materialIn.update({ where: { id }, data: { status: 'RECEIVED', inboundDate: new Date() } })
    return { current, updated }
  }))
}

export async function rejectManagedMaterialIn(id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.materialIn.findUnique({ where: { id } })
    if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
    if (current.status !== 'PENDING') throw new MaterialInDomainError('来料单状态不是待收货，无法拒收')
    const updated = await tx.materialIn.update({ where: { id }, data: { status: 'REJECTED' } })
    return { current, updated }
  })
}

export async function reverseManagedMaterialIn(id: string, input: ReverseMaterialInInput) {
  return runMaterialInDomainOperation(() => prisma.$transaction(async (tx) => {
    const current = await tx.materialIn.findUnique({
      where: { id }, include: { material: true, supplier: true },
    })
    if (!current || current.deletedAt) throw new MaterialInDomainError('来料单不存在或已归档', 404)
    if (current.status !== 'RECEIVED') throw new MaterialInDomainError('只有已收货来料单可以红冲')

    const stock = await tx.stock.findUnique({ where: { materialId: current.materialId } })
    if (!stock) throw new MaterialInDomainError('库存记录不存在，无法红冲')
    const layer = await tx.inventoryCostLayer.findFirst({ where: { materialInId: current.id } })
    if (layer) {
      const activeConsumptionCount = await tx.costLayerConsumption.count({
        where: { costLayerId: layer.id, restoredAt: null },
      })
      if (!isMaterialInCostLayerUntouched(layer, activeConsumptionCount)) {
        throw new MaterialInDomainError('该来料批次已被领料或成本层已变动，不能直接红冲，请先退料或做存货调整')
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
        idempotencyKey: `MATERIAL_IN:${current.id}:REVERSE`, refType: 'MATERIAL_IN_REVERSE', refId: current.id,
        note: `红冲来料单 ${current.inboundNo}: ${input.reason}`, createdBy: input.reversedBy,
      },
    })
    if (sourceMovement) {
      await tx.stockLog.update({ where: { id: sourceMovement.id }, data: { reversalMovementId: reversalMovement.id } })
    }
    const updated = await tx.materialIn.update({
      where: { id: current.id },
      data: {
        status: 'REVERSED',
        note: current.note ? `${current.note}\n红冲原因：${input.reason}` : `红冲原因：${input.reason}`,
      },
      include: { material: true, supplier: true },
    })
    return { current, updated }
  }))
}
