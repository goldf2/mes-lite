import { prisma } from '@/lib/prisma'
import { postInventoryIssue, postInventoryReceipt, reverseInventoryIssue } from '@/modules/inventory'
import type { CostLayerConsumptionInput } from '@/lib/costing'
import {
  allocateReturnToShipmentLots,
  allocateShipmentInventoryLots,
  createHistoricalShipmentLotAllocation,
  createInventoryLotReceipt,
  recordShipmentStockShortage,
  reverseShipmentStockShortages,
  reverseShipmentInventoryLots,
} from '@/modules/inventory'
import { createReturnQualityInspection } from '@/modules/quality'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'

const tolerance = 0.000001

export async function shipManagedShipment(id: string, shippedBy: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id },
      include: {
        items: {
          include: { material: true, location: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })
    if (!shipment) throw new SalesDomainError('发货单不存在', 404)
    if (shipment.items.length === 0) throw new SalesDomainError('发货单没有明细，不能确认发货')
    assertInventoryLocationDataScope(scope, shipment.items.map((item) => item.locationId))
    if (shipment.status !== 'PENDING') throw new SalesDomainError('只能确认待发货状态的发货单')

    const packages = await tx.packageDocument.findMany({
      where: { shipmentId: shipment.id, deletedAt: null },
      include: { items: { select: { shipmentItemId: true, quantity: true } } },
    })
    if (packages.length > 0) {
      const packedByItem = new Map<string, number>()
      for (const packageDocument of packages) {
        for (const item of packageDocument.items) {
          packedByItem.set(item.shipmentItemId, (packedByItem.get(item.shipmentItemId) || 0) + Number(item.quantity))
        }
      }
      for (const item of shipment.items) {
        const packedQty = packedByItem.get(item.id) || 0
        if (Math.abs(packedQty - Number(item.qty)) > tolerance) {
          throw new SalesDomainError(`明细 ${item.material.code} 装箱合计 ${Number(packedQty.toFixed(6))}，必须与发货数量 ${item.qty} ${item.unitSnapshot} 一致`)
        }
      }
    }

    let shippedValuationQty = 0
    let shippedCostAmount = 0
    let hasStockShortage = false
    let singleItemSnapshot: {
      stockUnit: string | null
      valuationUnit: string | null
      conversionRateUsed: number | null
      conversionSource: string | null
    } | null = null
    for (const item of shipment.items) {
      const issue = await postInventoryIssue(tx, {
        materialId: item.materialId,
        stockQty: Number(item.qty),
        type: 'OUT',
        refType: 'SHIPMENT',
        refId: shipment.id,
        note: `发货单 ${shipment.shipmentNo} 明细 ${item.sortOrder + 1} 出库`,
        createdBy: shippedBy,
        idempotencyKey: `SHIPMENT:${shipment.id}:ITEM:${item.id}:SHIP`,
        locationId: item.locationId,
        allowNegativeStock: true,
      })
      if (Number(issue.allocatedStockQty) > tolerance) {
        await allocateShipmentInventoryLots(tx, {
          shipmentId: shipment.id,
          shipmentItemId: item.id,
          materialId: item.materialId,
          materialCode: issue.material!.code,
          locationId: issue.location!.id,
          locationCode: issue.location!.code,
          stockQty: Number(issue.allocatedStockQty),
          locationStockQtyAdjustment: Number(item.qty),
          issueValuationQty: Number(issue.valuationQty),
          issueCostAmount: Number(issue.costAmount),
          stockLogId: issue.movement!.id,
          createdBy: shippedBy,
        })
      }
      if (Number(issue.negativeStockQty) > tolerance) {
        hasStockShortage = true
        await recordShipmentStockShortage(tx, {
          shipmentId: shipment.id,
          shipmentItemId: item.id,
          materialId: item.materialId,
          locationId: issue.location!.id,
          stockQty: Number(issue.negativeStockQty),
        })
      }
      await tx.shipmentItem.update({
        where: { id: item.id },
        data: {
          shippedValuationQty: issue.valuationQty,
          shippedCostAmount: issue.costAmount,
          stockUnitSnapshot: issue.material?.stockUnit,
          valuationUnitSnapshot: issue.material?.valuationUnit,
          conversionRateUsed: issue.conversionRateUsed,
          conversionSource: issue.conversionSource,
          costLayerSnapshot: issue.layerConsumptions.length > 0 ? JSON.stringify(issue.layerConsumptions) : null,
        },
      })
      shippedValuationQty += Number(issue.valuationQty)
      shippedCostAmount += Number(issue.costAmount)
      if (shipment.items.length === 1) {
        singleItemSnapshot = {
          stockUnit: issue.material?.stockUnit || null,
          valuationUnit: issue.material?.valuationUnit || null,
          conversionRateUsed: issue.conversionRateUsed == null ? null : Number(issue.conversionRateUsed),
          conversionSource: issue.conversionSource || null,
        }
      }
    }

    const updated = await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'SHIPPED',
        shippedAt: new Date(),
        lotTraceStatus: hasStockShortage ? 'SHORTAGE' : 'TRACKED',
        shippedValuationQty,
        shippedCostAmount,
        stockUnitSnapshot: singleItemSnapshot?.stockUnit || null,
        valuationUnitSnapshot: singleItemSnapshot?.valuationUnit || null,
        conversionRateUsed: singleItemSnapshot?.conversionRateUsed ?? null,
        conversionSource: shipment.items.length === 1 ? singleItemSnapshot?.conversionSource || null : 'MULTI_ITEM',
      },
    })
    if (packages.length > 0) {
      await tx.packageDocument.updateMany({ where: { shipmentId: shipment.id, deletedAt: null }, data: { status: 'SHIPPED' } })
    }
    return { before: shipment, updated }
  }))
}

export async function deliverManagedShipment(id: string, deliveredBy: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.shipment.findUnique({ where: { id }, include: { items: { select: { locationId: true } } } })
  if (!before) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, before.items.map((item) => item.locationId))
  if (before.status !== 'SHIPPED') throw new SalesDomainError('只能确认已发货状态的发货单签收')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredBy } })
    await tx.packageDocument.updateMany({ where: { shipmentId: id, deletedAt: null, status: 'SHIPPED' }, data: { status: 'DELIVERED' } })
    return { before, updated }
  })
}

export async function cancelManagedShipment(id: string, cancelledBy: string, reason: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.shipment.findUnique({ where: { id }, include: { items: { select: { locationId: true } } } })
  if (!before) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, before.items.map((item) => item.locationId))
  if (before.status !== 'PENDING') throw new SalesDomainError('只有待发货单可以取消；已发货请冲销，已签收请登记退货')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy, cancelReason: reason } })
    await tx.packageDocument.updateMany({ where: { shipmentId: id, deletedAt: null, status: 'PACKED' }, data: { status: 'CANCELLED' } })
    return { before, updated }
  })
}

export async function reverseManagedShipment(
  id: string,
  reversedBy: string,
  reason: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id },
      include: {
        items: { include: { material: true, location: true }, orderBy: { sortOrder: 'asc' } },
        returnOrders: { select: { id: true, returnNo: true, status: true } },
      },
    })
    if (!shipment) throw new SalesDomainError('发货单不存在', 404)
    assertInventoryLocationDataScope(scope, shipment.items.map((item) => item.locationId))
    if (shipment.status === 'DELIVERED') throw new SalesDomainError('发货单已经签收，不能冲销发货，请登记客户退货')
    if (shipment.status !== 'SHIPPED') throw new SalesDomainError('只能冲销已发货、尚未签收的发货单')
    const activeReturn = shipment.returnOrders.find((item) => item.status === 'PENDING' || item.status === 'PROCESSED')
    if (activeReturn) throw new SalesDomainError(`发货单已有退货单 ${activeReturn.returnNo}，不能再整单冲销`)

    for (const item of shipment.items) {
      const sourceMovement = await tx.stockLog.findUnique({
        where: { idempotencyKey: `SHIPMENT:${shipment.id}:ITEM:${item.id}:SHIP` },
      })
      if (!sourceMovement) throw new SalesDomainError(`明细 ${item.material.code} 缺少原发货库存流水，不能冲销`)
      let layerConsumptions: CostLayerConsumptionInput[] = []
      if (item.costLayerSnapshot) {
        try {
          layerConsumptions = JSON.parse(item.costLayerSnapshot) as CostLayerConsumptionInput[]
        } catch {
          throw new SalesDomainError(`明细 ${item.material.code} 的 FIFO 成本快照损坏，不能冲销`)
        }
      }
      const reversal = await reverseInventoryIssue(tx, {
        sourceMovementId: sourceMovement.id,
        refType: 'SHIPMENT_REVERSAL',
        refId: shipment.id,
        note: `发货单 ${shipment.shipmentNo} 冲销：${reason}`,
        createdBy: reversedBy,
        idempotencyKey: `SHIPMENT:${shipment.id}:ITEM:${item.id}:REVERSE`,
        layerConsumptions,
      })
      const shortageReversal = await reverseShipmentStockShortages(tx, {
        shipmentId: shipment.id,
        shipmentItemId: item.id,
        reversedBy,
        reason,
      })
      await reverseShipmentInventoryLots(tx, {
        shipmentId: shipment.id,
        shipmentItemId: item.id,
        stockLogId: reversal.movement.id,
        reason,
        reversedBy,
        allowEmpty: shortageReversal.hadShortage,
      })
    }

    const updated = await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: 'REVERSED', lotTraceStatus: 'REVERSED', reversedAt: new Date(), reversedBy, reverseReason: reason },
    })
    await tx.packageDocument.updateMany({
      where: { shipmentId: shipment.id, deletedAt: null, status: 'SHIPPED' },
      data: { status: 'REVERSED' },
    })
    return { before: shipment, updated }
  }))
}

export async function processManagedReturn(id: string, processedBy: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const returnOrder = await tx.returnOrder.findUnique({
      where: { id },
      include: { shipment: true, shipmentItem: { include: { material: true } } },
    })
    if (!returnOrder) throw new SalesDomainError('退货单不存在', 404)
    assertInventoryLocationDataScope(scope, [returnOrder.locationId])
    if (returnOrder.status !== 'PENDING') throw new SalesDomainError('只能处理待处理状态的退货单')
    const item = returnOrder.shipmentItem
    const materialId = item.materialId
    const stock = await tx.stock.findUnique({ where: { materialId } })
    const availableStockQty = stock ? Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty) - Number(stock.reworkQty) : 0
    const availableValuationQty = stock ? Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) - Number(stock.reworkValuationQty) : 0
    const availableCost = stock ? Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) - Number(stock.reworkCost) : 0
    const currentValuationRate = stock && availableStockQty > 0 ? availableValuationQty / availableStockQty : Number(item.material.conversionRate || 1)
    const currentStockUnitCost = stock && availableStockQty > 0 ? availableCost / availableStockQty : 0
    const returnValuationQty = item.qty > 0
      ? Number((Number(item.shippedValuationQty) * returnOrder.qty / item.qty).toFixed(6))
      : Number((returnOrder.qty * currentValuationRate).toFixed(6))
    const returnCostAmount = item.qty > 0
      ? Number((Number(item.shippedCostAmount) * returnOrder.qty / item.qty).toFixed(6))
      : Number((returnOrder.qty * currentStockUnitCost).toFixed(6))
    const sourceMovement = await tx.stockLog.findFirst({
      where: { refType: 'SHIPMENT', refId: returnOrder.shipmentId, type: 'OUT', stock: { is: { materialId } } },
      orderBy: { createdAt: 'desc' },
    })
    const receipt = await postInventoryReceipt(tx, {
      materialId,
      stockQty: Number(returnOrder.qty),
      valuationQty: returnValuationQty,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costAmount: returnCostAmount,
      type: 'RETURN_IN',
      refType: 'RETURN',
      refId: returnOrder.id,
      note: `退货单 ${returnOrder.returnNo} 退回入库`,
      createdBy: processedBy,
      idempotencyKey: `RETURN:${returnOrder.id}:PROCESS`,
      sourceMovementId: sourceMovement?.id,
      locationId: returnOrder.locationId,
      inventoryStatus: 'QUARANTINE',
    })
    let shipmentAllocations = await tx.shipmentLotAllocation.findMany({ where: { shipmentItemId: item.id, status: 'ACTIVE' } })
    if (shipmentAllocations.length === 0) {
      const previousReturns = await tx.returnOrder.aggregate({
        where: { shipmentItemId: item.id, status: 'PROCESSED', id: { not: returnOrder.id } },
        _sum: { qty: true },
      })
      shipmentAllocations = await createHistoricalShipmentLotAllocation(tx, {
        shipmentId: returnOrder.shipmentId,
        shipmentItemId: item.id,
        shipmentNo: returnOrder.shipment.shipmentNo,
        materialId,
        materialCode: receipt.material!.code,
        locationId: item.locationId,
        stockQty: Number(item.qty),
        valuationQty: Number(item.shippedValuationQty),
        costAmount: Number(item.shippedCostAmount),
        previouslyReturnedStockQty: Number(previousReturns._sum.qty || 0),
        createdBy: processedBy,
      })
    }
    const lot = await createInventoryLotReceipt(tx, {
      lotNo: `RT-${returnOrder.returnNo}`,
      materialId,
      returnOrderId: returnOrder.id,
      sourceType: 'RETURN_ORDER',
      sourceId: returnOrder.id,
      locationId: receipt.location!.id,
      inventoryStatus: 'QUARANTINE',
      stockQty: Number(returnOrder.qty),
      valuationQty: returnValuationQty,
      costAmount: returnCostAmount,
      stockLogId: receipt.movement!.id,
      costLayerId: receipt.costLayer?.id,
      idempotencyKey: `RETURN:${returnOrder.id}:LOT_RECEIPT`,
      note: `退货单 ${returnOrder.returnNo} 独立待检批次`,
      createdBy: processedBy,
    })
    await Promise.all([
      tx.stockLog.update({ where: { id: receipt.movement!.id }, data: { lotId: lot.id, inventoryStatus: 'QUARANTINE', toInventoryStatus: 'QUARANTINE' } }),
      receipt.costLayer ? tx.inventoryCostLayer.update({ where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'QUARANTINE' } }) : Promise.resolve(),
      createReturnQualityInspection(tx, { inspectionNo: `QI-${lot.lotNo}`, lotId: lot.id, sourceId: returnOrder.id, inspectedQty: Number(returnOrder.qty) }),
    ])
    await allocateReturnToShipmentLots(tx, {
      returnOrderId: returnOrder.id,
      shipmentItemId: item.id,
      returnedLotId: lot.id,
      stockQty: Number(returnOrder.qty),
      valuationQty: returnValuationQty,
      costAmount: returnCostAmount,
    })
    const updated = await tx.returnOrder.update({
      where: { id: returnOrder.id },
      data: {
        status: 'PROCESSED', processedAt: new Date(), processedBy, materialId,
        processedValuationQty: returnValuationQty, processedCostAmount: returnCostAmount,
        stockUnitSnapshot: receipt.material?.stockUnit, valuationUnitSnapshot: receipt.material?.valuationUnit,
        conversionRateUsed: receipt.quantities?.conversionRateUsed, conversionSource: 'ORIGINAL_MOVEMENT',
      },
    })
    return { before: returnOrder, updated }
  }))
}

export async function rejectManagedReturn(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.returnOrder.findUnique({ where: { id } })
  if (!before) throw new SalesDomainError('退货单不存在', 404)
  assertInventoryLocationDataScope(scope, [before.locationId])
  if (before.status !== 'PENDING') throw new SalesDomainError('只能拒绝待处理状态的退货单')
  const updated = await prisma.returnOrder.update({ where: { id }, data: { status: 'REJECTED' } })
  return { before, updated }
}
