import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { changeStockLocationBalance } from '@/modules/inventory'
import type { LegacyProductionOrderStockInInput } from '../contracts/legacy-production-order-execution-schema'
import { legacyProductionCompatibilityError, legacyStockInStatusError } from '../domain/legacy-production-order-execution-rules'
import { ProductionOrderDomainError } from '../domain/production-order-errors'

const roundQty = (value: number) => Number(value.toFixed(6))

export async function stockInLegacyProductionOrder(
  orderId: string,
  input: LegacyProductionOrderStockInInput,
  createdBy: string,
  auditContext?: AuditContext,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUnique({
        where: { id: orderId },
        include: { targetMaterial: true },
      })
      if (!order) throw new ProductionOrderDomainError('工单不存在', 404)
      const compatibilityError = legacyProductionCompatibilityError(order.materialId)
      if (compatibilityError) throw new ProductionOrderDomainError(compatibilityError, 410)
      const statusError = legacyStockInStatusError(order.status)
      if (statusError) throw new ProductionOrderDomainError(statusError)

      const stockIn = await tx.stockIn.create({
        data: {
          orderId,
          productId: order.productId,
          qty: input.qty,
          batchNo: input.batchNo,
          inBy: input.inBy,
          note: input.note,
        },
      })
      const targetMaterial = order.targetMaterial
      const valuationQty = targetMaterial
        ? roundQty(input.qty * Number(targetMaterial.conversionRate || 1))
        : 0
      let stock = targetMaterial
        ? await tx.stock.findUnique({ where: { materialId: targetMaterial.id } })
        : await tx.stock.findUnique({ where: { productId: order.productId } })
      if (!stock) {
        stock = await tx.stock.create({
          data: targetMaterial ? { materialId: targetMaterial.id } : { productId: order.productId },
        })
      }

      const beforeQty = Number(stock.qty)
      const beforeValuationQty = Number(stock.valuationQty)
      const afterQty = roundQty(beforeQty + input.qty)
      const afterValuationQty = roundQty(beforeValuationQty + valuationQty)
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: afterQty,
          availableQty: roundQty(Number(stock.availableQty) + input.qty),
          ...(targetMaterial ? {
            valuationQty: afterValuationQty,
            availableValuationQty: roundQty(Number(stock.availableValuationQty) + valuationQty),
          } : {}),
        },
      })
      const { location } = await changeStockLocationBalance(tx, {
        stockId: stock.id,
        qtyDelta: input.qty,
      })
      await tx.stockLog.create({
        data: {
          stockId: stock.id,
          locationId: location.id,
          type: 'STOCK_IN',
          qty: input.qty,
          beforeQty,
          afterQty,
          ...(targetMaterial ? {
            valuationQty,
            beforeValuationQty,
            afterValuationQty,
          } : {}),
          refType: 'STOCK_IN',
          refId: order.id,
          note: targetMaterial
            ? `工单 ${order.orderNo} 物料入库`
            : `工单 ${order.orderNo} 成品入库`,
          createdBy,
        },
      })
      const updated = await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          completeQty: input.qty,
          completeTime: new Date(),
        },
      })
      if (auditContext) await createAuditLog(tx, auditContext, {
        action: 'CREATE',
        entityType: 'STOCK_IN',
        entityId: stockIn.id,
        entityLabel: order.orderNo,
        beforeData: order,
        afterData: { stockIn, order: updated },
        note: '历史工单兼容入库',
      })
      return { order, stockIn, stock, updated }
    })
  } catch (error) {
    if (error instanceof ProductionOrderDomainError) throw error
    if (error instanceof Error) throw new ProductionOrderDomainError(error.message)
    throw error
  }
}
