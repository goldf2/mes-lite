import { prisma } from '@/lib/prisma'
import { postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'
import {
  allocateReturnToShipmentLots,
  allocateShipmentInventoryLots,
  createHistoricalShipmentLotAllocation,
  createInventoryLotReceipt,
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
      })
      await allocateShipmentInventoryLots(tx, {
        shipmentId: shipment.id,
        shipmentItemId: item.id,
        materialId: item.materialId,
        materialCode: issue.material!.code,
        locationId: issue.location!.id,
        locationCode: issue.location!.code,
        stockQty: Number(item.qty),
        issueValuationQty: Number(issue.valuationQty),
        issueCostAmount: Number(issue.costAmount),
        stockLogId: issue.movement!.id,
        createdBy: shippedBy,
      })
      await tx.shipmentItem.update({
        where: { id: item.id },
        data: {
          shippedValuationQty: issue.valuationQty,
          shippedCostAmount: issue.costAmount,
          stockUnitSnapshot: issue.material?.stockUnit,
          valuationUnitSnapshot: issue.material?.valuationUnit,
          conversionRateUsed: issue.conversionRateUsed,
          conversionSource: issue.conversionSource,
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
        lotTraceStatus: 'TRACKED',
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

export async function deliverManagedShipment(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.shipment.findUnique({ where: { id }, include: { items: { select: { locationId: true } } } })
  if (!before) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, before.items.map((item) => item.locationId))
  if (before.status !== 'SHIPPED') throw new SalesDomainError('只能确认已发货状态的发货单签收')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({ where: { id }, data: { status: 'DELIVERED' } })
    await tx.packageDocument.updateMany({ where: { shipmentId: id, deletedAt: null, status: 'SHIPPED' }, data: { status: 'DELIVERED' } })
    return { before, updated }
  })
}

export async function cancelManagedShipment(id: string, scope: EffectiveDataScope = unrestrictedDataScope) {
  const before = await prisma.shipment.findUnique({ where: { id }, include: { items: { select: { locationId: true } } } })
  if (!before) throw new SalesDomainError('发货单不存在', 404)
  assertInventoryLocationDataScope(scope, before.items.map((item) => item.locationId))
  if (before.status !== 'PENDING') throw new SalesDomainError('已发货的发货单不可取消，请走退货流程')
  return prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({ where: { id }, data: { status: 'CANCELLED' } })
    await tx.packageDocument.updateMany({ where: { shipmentId: id, deletedAt: null, status: 'PACKED' }, data: { status: 'CANCELLED' } })
    return { before, updated }
  })
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
