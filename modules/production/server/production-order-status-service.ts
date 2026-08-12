import { prisma } from '@/lib/prisma'
import { restoreMaterialCost } from '@/lib/costing'
import { changeStockLocationBalance } from '@/lib/inventory'
import type { CancelProductionOrderInput } from '../contracts/production-order-schema'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import {
  productionOrderCancellationError,
  productionOrderConfirmationError,
  productionOrderReleaseError,
  releasedProductionOrderStatus,
} from '../domain/production-order-status'

export async function confirmProductionOrder(id: string, now = new Date()) {
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: { _count: { select: { picks: true } } },
  })
  if (!order) throw new ProductionOrderDomainError('生产订单不存在', 404)
  const confirmationError = productionOrderConfirmationError(order.status)
  if (confirmationError) throw new ProductionOrderDomainError(confirmationError)
  const releaseError = productionOrderReleaseError(order.materialId, order._count.picks)
  if (releaseError) throw new ProductionOrderDomainError(releaseError)

  const status = releasedProductionOrderStatus(order.materialId, order._count.picks)
  const updated = await prisma.productionOrder.update({
    where: { id },
    data: { status, startTime: order.materialId ? null : now },
  })
  return {
    previous: order,
    updated,
    message: order.materialId
      ? `生产订单 ${updated.orderNo} 已发布，可派工或登记班后生产实绩`
      : order._count.picks === 0
        ? `历史生产订单 ${updated.orderNo} 已确认，可继续兼容派工`
        : `历史生产订单 ${updated.orderNo} 已确认`,
  }
}

export async function cancelProductionOrder(id: string, input: CancelProductionOrderInput, now = new Date()) {
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      picks: { include: { material: { include: { stock: true } } } },
      reports: true,
      stockIns: true,
    },
  })
  if (!order) throw new ProductionOrderDomainError('工单不存在', 404)
  const cancellationError = productionOrderCancellationError(order.status, order.stockIns.length)
  if (cancellationError) throw new ProductionOrderDomainError(cancellationError)

  await prisma.$transaction(async (tx) => {
    for (const pick of order.picks) {
      const stockId = pick.material.stock?.id
      if (stockId) {
        const stock = await tx.stock.findUnique({ where: { id: stockId } })
        if (stock && pick.actualQty > 0) {
          await restoreMaterialCost(tx, { pickItemId: pick.id, costingMethod: pick.costingMethod })
          const beforeQty = Number(stock.qty)
          const beforeValuationQty = Number(stock.valuationQty)
          const beforeCostAmount = Number(stock.totalCost)
          const returnQty = Number(pick.actualQty)
          const returnValuationQty = Number(pick.actualValuationQty)
          const returnCostAmount = Number(pick.costAmount)
          const afterQty = Number((beforeQty + returnQty).toFixed(6))
          const afterValuationQty = Number((beforeValuationQty + returnValuationQty).toFixed(6))
          const afterCostAmount = Number((beforeCostAmount + returnCostAmount).toFixed(6))

          await tx.stock.update({
            where: { id: stock.id },
            data: {
              qty: { increment: returnQty },
              availableQty: { increment: returnQty },
              valuationQty: { increment: returnValuationQty },
              availableValuationQty: { increment: returnValuationQty },
              totalCost: { increment: returnCostAmount },
              valuationUnitCost: Math.max(0, afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0),
              stockUnitCost: Math.max(0, afterQty > 0 ? afterCostAmount / afterQty : 0),
            },
          })
          const { location } = await changeStockLocationBalance(tx, { stockId: stock.id, qtyDelta: returnQty })
          await tx.stockLog.create({
            data: {
              stockId: stock.id,
              locationId: location.id,
              type: 'RETURN',
              qty: returnQty,
              beforeQty,
              afterQty,
              valuationQty: returnValuationQty,
              beforeValuationQty,
              afterValuationQty,
              costAmount: returnCostAmount,
              beforeCostAmount,
              afterCostAmount,
              refType: 'RETURN',
              refId: pick.id,
              note: `工单 ${order.orderNo} 取消退料`,
            },
          })
        } else if (stock) {
          const requiredQty = Number(pick.requiredQty)
          const stockQty = Number(stock.qty) - Number(stock.quarantineQty) - Number(stock.holdQty)
          const availableValuationQty = Number(stock.valuationQty) - Number(stock.quarantineValuationQty) - Number(stock.holdValuationQty)
          const conversionRate = Number(pick.conversionRateUsed || pick.material.conversionRate || 1)
          const valuationReserveQty = Number(pick.reservedValuationQty) > 0
            ? Number(pick.reservedValuationQty)
            : stockQty > 0
              ? Number((requiredQty * (availableValuationQty / stockQty)).toFixed(6))
              : Number((requiredQty * conversionRate).toFixed(6))
          await tx.stock.update({
            where: { id: stock.id },
            data: {
              reservedQty: { decrement: requiredQty },
              availableQty: { increment: requiredQty },
              reservedValuationQty: { decrement: valuationReserveQty },
              availableValuationQty: { increment: valuationReserveQty },
            },
          })
          await changeStockLocationBalance(tx, { stockId: stock.id, qtyDelta: 0, reservedDelta: -requiredQty, availableDelta: requiredQty })
        }
      }
      await tx.pickItem.update({ where: { id: pick.id }, data: { status: pick.actualQty > 0 ? 'RETURNED' : 'CANCELLED' } })
    }

    if (order.reports.length > 0) {
      await tx.workReport.updateMany({ where: { orderId: order.id }, data: { remark: '工单取消作废' } })
    }
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelTime: now, cancelReason: input.reason },
    })
  })
  return { orderNo: order.orderNo }
}
