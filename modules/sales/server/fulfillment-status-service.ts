import { prisma } from '@/lib/prisma'
import { postInventoryIssue, postInventoryReceipt } from '@/lib/inventory'
import { resolveMaterialIdForProduct } from '@/lib/material-product'
import {
  allocateReturnToShipmentLots,
  allocateShipmentInventoryLots,
  createHistoricalShipmentLotAllocation,
  createInventoryLotReceipt,
} from '@/modules/inventory'
import { createReturnQualityInspection } from '@/modules/quality'
import { runSalesDomainOperation, SalesDomainError } from '../domain/sales-errors'
import { refreshSalesOrderStatus } from './sales-order-availability-service'

export async function shipManagedShipment(id: string, shippedBy: string) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({ where: { id } })
    if (!shipment) throw new SalesDomainError('发货单不存在', 404)
    if (shipment.status !== 'PENDING') throw new SalesDomainError('只能确认待发货状态的发货单')
    const materialId = await resolveMaterialIdForProduct(tx, shipment.productId, shipment.materialId)
    if (!materialId) throw new SalesDomainError('发货对象未关联统一物料档案')
    if (shipment.salesOrderItemId) {
      const salesItem = await tx.salesOrderItem.findUnique({ where: { id: shipment.salesOrderItemId } })
      if (!salesItem) throw new SalesDomainError('关联的销售订单明细不存在')
      if (Number(salesItem.shippedQty) + Number(shipment.qty) > Number(salesItem.qty) + 0.000001) {
        throw new SalesDomainError('累计发货数量超过销售订单数量')
      }
    }
    const issue = await postInventoryIssue(tx, {
      materialId, stockQty: Number(shipment.qty), type: 'OUT', refType: 'SHIPMENT', refId: shipment.id,
      note: `发货单 ${shipment.shipmentNo} 出库`, createdBy: shippedBy,
      idempotencyKey: `SHIPMENT:${shipment.id}:SHIP`, locationId: shipment.locationId,
    })
    await allocateShipmentInventoryLots(tx, {
      shipmentId: shipment.id,
      materialId,
      materialCode: issue.material!.code,
      locationId: issue.location!.id,
      locationCode: issue.location!.code,
      stockQty: Number(shipment.qty),
      issueValuationQty: Number(issue.valuationQty),
      issueCostAmount: Number(issue.costAmount),
      stockLogId: issue.movement!.id,
      createdBy: shippedBy,
    })
    const updated = await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'SHIPPED', shippedAt: new Date(), materialId, lotTraceStatus: 'TRACKED',
        shippedValuationQty: issue.valuationQty, shippedCostAmount: issue.costAmount,
        stockUnitSnapshot: issue.material?.stockUnit, valuationUnitSnapshot: issue.material?.valuationUnit,
        conversionRateUsed: issue.conversionRateUsed, conversionSource: issue.conversionSource,
      },
    })
    if (shipment.salesOrderItemId && shipment.salesOrderId) {
      await tx.salesOrderItem.update({
        where: { id: shipment.salesOrderItemId }, data: { shippedQty: { increment: Number(shipment.qty) } },
      })
      await refreshSalesOrderStatus(tx, shipment.salesOrderId)
    }
    return { before: shipment, updated }
  }))
}

export async function deliverManagedShipment(id: string) {
  const before = await prisma.shipment.findUnique({ where: { id } })
  if (!before) throw new SalesDomainError('发货单不存在', 404)
  if (before.status !== 'SHIPPED') throw new SalesDomainError('只能确认已发货状态的发货单签收')
  const updated = await prisma.shipment.update({ where: { id }, data: { status: 'DELIVERED' } })
  return { before, updated }
}

export async function cancelManagedShipment(id: string) {
  const before = await prisma.shipment.findUnique({ where: { id } })
  if (!before) throw new SalesDomainError('发货单不存在', 404)
  if (before.status !== 'PENDING') throw new SalesDomainError('已发货的发货单不可取消，请走退货流程')
  const updated = await prisma.shipment.update({ where: { id }, data: { status: 'CANCELLED' } })
  return { before, updated }
}

export async function processManagedReturn(id: string, processedBy: string) {
  return runSalesDomainOperation(() => prisma.$transaction(async (tx) => {
    const returnOrder = await tx.returnOrder.findUnique({ where: { id } })
    if (!returnOrder) throw new SalesDomainError('退货单不存在', 404)
    if (returnOrder.status !== 'PENDING') throw new SalesDomainError('只能处理待处理状态的退货单')
    const materialId = await resolveMaterialIdForProduct(tx, returnOrder.productId, returnOrder.materialId)
    if (!materialId) throw new SalesDomainError('退货对象未关联统一物料档案')
    const [stock, material, shipment] = await Promise.all([
      tx.stock.findUnique({ where: { materialId } }),
      tx.material.findUnique({ where: { id: materialId }, select: { conversionRate: true } }),
      returnOrder.shipmentId ? tx.shipment.findUnique({ where: { id: returnOrder.shipmentId } }) : null,
    ])
    const availableStockQty = stock ? Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty) : 0
    const availableValuationQty = stock ? Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty) : 0
    const availableCost = stock ? Number(stock.totalCost) - Number(stock.quarantineCost) - Number(stock.holdCost) : 0
    const currentValuationRate = stock && availableStockQty > 0
      ? availableValuationQty / availableStockQty
      : Number(material?.conversionRate || 1)
    const currentStockUnitCost = stock && availableStockQty > 0 ? availableCost / availableStockQty : 0
    const returnValuationQty = shipment && shipment.qty > 0
      ? Number((Number(shipment.shippedValuationQty) * returnOrder.qty / shipment.qty).toFixed(6))
      : Number((returnOrder.qty * currentValuationRate).toFixed(6))
    const returnCostAmount = shipment && shipment.qty > 0
      ? Number((Number(shipment.shippedCostAmount) * returnOrder.qty / shipment.qty).toFixed(6))
      : Number((returnOrder.qty * currentStockUnitCost).toFixed(6))
    const sourceMovement = shipment ? await tx.stockLog.findFirst({
      where: { refType: 'SHIPMENT', refId: shipment.id, type: 'OUT' }, orderBy: { createdAt: 'desc' },
    }) : null
    const receipt = await postInventoryReceipt(tx, {
      materialId, stockQty: Number(returnOrder.qty), valuationQty: returnValuationQty,
      conversionSource: shipment ? 'ORIGINAL_MOVEMENT' : 'LEGACY_ESTIMATE', costAmount: returnCostAmount,
      type: 'RETURN_IN', refType: 'RETURN', refId: returnOrder.id,
      note: `退货单 ${returnOrder.returnNo} 退回入库`, createdBy: processedBy,
      idempotencyKey: `RETURN:${returnOrder.id}:PROCESS`, sourceMovementId: sourceMovement?.id,
      locationId: returnOrder.locationId,
      inventoryStatus: 'QUARANTINE',
    })
    let shipmentAllocations = shipment
      ? await tx.shipmentLotAllocation.findMany({ where: { shipmentId: shipment.id, status: 'ACTIVE' } })
      : []
    if (shipment && shipmentAllocations.length === 0) {
      const previousReturns = await tx.returnOrder.aggregate({
        where: { shipmentId: shipment.id, status: 'PROCESSED', id: { not: returnOrder.id } },
        _sum: { qty: true },
      })
      shipmentAllocations = await createHistoricalShipmentLotAllocation(tx, {
        shipmentId: shipment.id,
        shipmentNo: shipment.shipmentNo,
        materialId,
        materialCode: receipt.material!.code,
        locationId: shipment.locationId || receipt.location!.id,
        stockQty: Number(shipment.qty),
        valuationQty: Number(shipment.shippedValuationQty),
        costAmount: Number(shipment.shippedCostAmount),
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
      tx.stockLog.update({
        where: { id: receipt.movement!.id },
        data: { lotId: lot.id, inventoryStatus: 'QUARANTINE', toInventoryStatus: 'QUARANTINE' },
      }),
      receipt.costLayer ? tx.inventoryCostLayer.update({
        where: { id: receipt.costLayer.id }, data: { lotId: lot.id, inventoryStatus: 'QUARANTINE' },
      }) : Promise.resolve(),
      createReturnQualityInspection(tx, {
        inspectionNo: `QI-${lot.lotNo}`,
        lotId: lot.id,
        sourceId: returnOrder.id,
        inspectedQty: Number(returnOrder.qty),
      }),
    ])
    if (shipment) {
      await allocateReturnToShipmentLots(tx, {
        returnOrderId: returnOrder.id,
        shipmentId: shipment.id,
        returnedLotId: lot.id,
        stockQty: Number(returnOrder.qty),
        valuationQty: returnValuationQty,
        costAmount: returnCostAmount,
      })
    }
    const updated = await tx.returnOrder.update({
      where: { id: returnOrder.id },
      data: {
        status: 'PROCESSED', processedAt: new Date(), processedBy, materialId,
        processedValuationQty: returnValuationQty, processedCostAmount: returnCostAmount,
        stockUnitSnapshot: receipt.material?.stockUnit, valuationUnitSnapshot: receipt.material?.valuationUnit,
        conversionRateUsed: receipt.quantities?.conversionRateUsed,
        conversionSource: shipment ? 'ORIGINAL_MOVEMENT' : 'LEGACY_ESTIMATE',
      },
    })
    return { before: returnOrder, updated }
  }))
}

export async function rejectManagedReturn(id: string) {
  const before = await prisma.returnOrder.findUnique({ where: { id } })
  if (!before) throw new SalesDomainError('退货单不存在', 404)
  if (before.status !== 'PENDING') throw new SalesDomainError('只能拒绝待处理状态的退货单')
  const updated = await prisma.returnOrder.update({ where: { id }, data: { status: 'REJECTED' } })
  return { before, updated }
}
