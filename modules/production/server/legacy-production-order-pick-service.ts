import { prisma } from '@/lib/prisma'
import { consumeMaterialCost } from '@/lib/costing'
import { changeStockLocationBalance } from '@/lib/inventory'
import type { LegacyProductionOrderPickInput } from '../contracts/legacy-production-order-execution-schema'
import { ProductionOrderDomainError } from '../domain/production-order-errors'
import { legacyPickStatusError } from '../domain/legacy-production-order-execution-rules'

const roundQty = (value: number) => Number(value.toFixed(6))

export async function pickLegacyProductionOrder(
  orderId: string,
  input: LegacyProductionOrderPickInput,
  createdBy: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUnique({
        where: { id: orderId },
        select: { id: true, orderNo: true, status: true },
      })
      if (!order) throw new ProductionOrderDomainError('工单不存在', 404)
      const statusError = legacyPickStatusError(order.status)
      if (statusError) throw new ProductionOrderDomainError(statusError)

      for (const item of input.items) {
        const pick = await tx.pickItem.findFirst({
          where: { id: item.pickItemId, orderId },
          include: { material: { include: { stock: true } } },
        })
        if (!pick) throw new ProductionOrderDomainError('领料项不存在', 404)
        if (pick.status === 'COMPLETED') {
          throw new ProductionOrderDomainError(`物料 ${pick.material.name} 已完成领料，不可重复领料`)
        }

        const stock = pick.material.stock
        if (!stock) throw new ProductionOrderDomainError(`物料 ${pick.material.name} 无库存记录`)
        const requiredQty = Number(pick.requiredQty)
        if (Number(stock.availableQty) + requiredQty < item.actualQty) {
          throw new ProductionOrderDomainError(`物料 ${pick.material.name} 库存不足`)
        }

        const reservedValuationQty = Number(pick.reservedValuationQty) > 0
          ? Number(pick.reservedValuationQty)
          : Number(stock.qty) > 0
            ? roundQty(requiredQty * (Number(stock.valuationQty) / Number(stock.qty)))
            : roundQty(requiredQty * Number(pick.material.conversionRate || 1))
        const costResult = await consumeMaterialCost(tx, {
          materialId: pick.materialId,
          issueStockQty: item.actualQty,
          stock: {
            id: stock.id,
            qty: Number(stock.qty),
            valuationQty: Number(stock.valuationQty),
            totalCost: Number(stock.totalCost),
            valuationUnitCost: Number(stock.valuationUnitCost),
          },
          material: {
            costingMethod: pick.material.costingMethod,
            conversionRate: Number(pick.material.conversionRate),
          },
        })

        if (costResult.layerConsumptions.length > 0) {
          await tx.costLayerConsumption.createMany({
            data: costResult.layerConsumptions.map((layer) => ({
              pickItemId: pick.id,
              costLayerId: layer.costLayerId,
              materialId: layer.materialId,
              stockQty: layer.stockQty,
              valuationQty: layer.valuationQty,
              costAmount: layer.costAmount,
              stockUnitCost: layer.stockUnitCost,
              valuationUnitCost: layer.valuationUnitCost,
            })),
          })
        }

        const beforeQty = Number(stock.qty)
        const beforeValuationQty = Number(stock.valuationQty)
        const beforeCostAmount = Number(stock.totalCost)
        const afterQty = roundQty(beforeQty - item.actualQty)
        const afterValuationQty = roundQty(beforeValuationQty - costResult.issueValuationQty)
        const afterCostAmount = roundQty(beforeCostAmount - costResult.costAmount)
        const availableDelta = roundQty(requiredQty - item.actualQty)
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: afterQty,
            reservedQty: { decrement: requiredQty },
            availableQty: { increment: availableDelta },
            valuationQty: afterValuationQty,
            reservedValuationQty: { decrement: reservedValuationQty },
            availableValuationQty: { increment: roundQty(reservedValuationQty - costResult.issueValuationQty) },
            totalCost: afterCostAmount,
            valuationUnitCost: Math.max(0, afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0),
            stockUnitCost: Math.max(0, afterQty > 0 ? afterCostAmount / afterQty : 0),
          },
        })
        const { location } = await changeStockLocationBalance(tx, {
          stockId: stock.id,
          qtyDelta: -item.actualQty,
          reservedDelta: -requiredQty,
          availableDelta,
        })
        await tx.stockLog.create({
          data: {
            stockId: stock.id,
            locationId: location.id,
            type: 'PICK',
            qty: -item.actualQty,
            beforeQty,
            afterQty,
            valuationQty: -costResult.issueValuationQty,
            beforeValuationQty,
            afterValuationQty,
            costAmount: -costResult.costAmount,
            beforeCostAmount,
            afterCostAmount,
            refType: 'PICK',
            refId: pick.id,
            note: `工单 ${order.orderNo} 领料，成本法 ${pick.material.costingMethod}`,
            createdBy,
          },
        })
        await tx.pickItem.update({
          where: { id: pick.id },
          data: {
            actualQty: item.actualQty,
            actualValuationQty: costResult.issueValuationQty,
            conversionRateUsed: costResult.conversionRateUsed,
            conversionSource: costResult.conversionSource,
            costAmount: costResult.costAmount,
            costingMethod: pick.material.costingMethod,
            status: 'COMPLETED',
            pickedAt: new Date(),
            pickedBy: item.pickedBy,
          },
        })
      }

      const remainingPicks = await tx.pickItem.count({
        where: { orderId, status: { not: 'COMPLETED' } },
      })
      if (remainingPicks === 0) {
        await tx.productionOrder.update({ where: { id: orderId }, data: { status: 'PICKED' } })
      }
      return { order, items: input.items }
    })
  } catch (error) {
    if (error instanceof ProductionOrderDomainError) throw error
    if (error instanceof Error) throw new ProductionOrderDomainError(error.message)
    throw error
  }
}
