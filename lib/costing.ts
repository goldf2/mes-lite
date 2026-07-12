import { Prisma } from '@prisma/client'
import { normalizeConversionRate } from './units'

type CostingResult = {
  issueValuationQty: number
  costAmount: number
  conversionRateUsed: number
  conversionSource: string
  layerConsumptions: CostLayerConsumptionInput[]
}

export type CostLayerConsumptionInput = {
  costLayerId: string
  materialId: string
  stockQty: number
  valuationQty: number
  costAmount: number
  stockUnitCost: number
  valuationUnitCost: number
}

export async function consumeMaterialCost(
  tx: Prisma.TransactionClient,
  input: {
    materialId: string
    issueStockQty: number
    stock: {
      id: string
      qty: number
      valuationQty: number
      totalCost: number
      valuationUnitCost: number
    }
    material: {
      costingMethod: string
      conversionRate: number
    }
  }
): Promise<CostingResult> {
  const stockQty = Number(input.stock.qty)
  const stockValuationQty = Number(input.stock.valuationQty)
  const stockAverageRate = stockQty > 0 ? stockValuationQty / stockQty : 0
  const conversionRateUsed = normalizeConversionRate(stockAverageRate || input.material.conversionRate)
  const issueValuationQty = Number((input.issueStockQty * conversionRateUsed).toFixed(6))

  if (input.material.costingMethod === 'FIFO') {
    let remainingStockQty = input.issueStockQty
    let costAmount = 0
    let consumedValuationQty = 0
    const layerConsumptions: CostLayerConsumptionInput[] = []

    const layers = await tx.inventoryCostLayer.findMany({
      where: {
        materialId: input.materialId,
        status: 'OPEN',
        remainingStockQty: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
    })

    for (const layer of layers) {
      if (remainingStockQty <= 0) break
      const layerStockQty = Number(layer.remainingStockQty)
      const consumeStockQty = Math.min(layerStockQty, remainingStockQty)
      const layerRate = layerStockQty > 0 ? Number(layer.remainingValuationQty) / layerStockQty : conversionRateUsed
      const consumeValuationQty = Number((consumeStockQty * layerRate).toFixed(6))
      const consumeCost = Number((consumeStockQty * Number(layer.stockUnitCost)).toFixed(6))
      const layerRemainingAmount = Number(layer.remainingAmount || (layerStockQty * Number(layer.stockUnitCost)))

      const nextRemainingStockQty = Number((layerStockQty - consumeStockQty).toFixed(6))
      const nextRemainingValuationQty = Number((Number(layer.remainingValuationQty) - consumeValuationQty).toFixed(6))
      const nextRemainingAmount = Number((layerRemainingAmount - consumeCost).toFixed(6))

      await tx.inventoryCostLayer.update({
        where: { id: layer.id },
        data: {
          remainingStockQty: nextRemainingStockQty,
          remainingValuationQty: nextRemainingValuationQty,
          remainingAmount: Math.max(0, nextRemainingAmount),
          status: nextRemainingStockQty <= 0 ? 'CLOSED' : 'OPEN',
        },
      })

      remainingStockQty = Number((remainingStockQty - consumeStockQty).toFixed(6))
      consumedValuationQty = Number((consumedValuationQty + consumeValuationQty).toFixed(6))
      costAmount += consumeCost
      layerConsumptions.push({
        costLayerId: layer.id,
        materialId: input.materialId,
        stockQty: consumeStockQty,
        valuationQty: consumeValuationQty,
        costAmount: consumeCost,
        stockUnitCost: Number(layer.stockUnitCost),
        valuationUnitCost: Number(layer.valuationUnitCost),
      })
    }

    if (remainingStockQty > 0.000001) {
      throw new Error('FIFO 成本层库存不足，请先确认来料入库或建立期初成本层')
    }

    return {
      issueValuationQty: consumedValuationQty,
      costAmount: Number(costAmount.toFixed(6)),
      conversionRateUsed,
      conversionSource: 'STOCK_AVERAGE_FIFO',
      layerConsumptions,
    }
  }

  return {
    issueValuationQty,
    costAmount: Number((issueValuationQty * Number(input.stock.valuationUnitCost)).toFixed(6)),
    conversionRateUsed,
    conversionSource: 'STOCK_AVERAGE',
    layerConsumptions: [],
  }
}

export async function restoreMaterialCost(
  tx: Prisma.TransactionClient,
  input: {
    pickItemId: string
    costingMethod?: string | null
  }
) {
  if (input.costingMethod !== 'FIFO') return

  const consumptions = await tx.costLayerConsumption.findMany({
    where: {
      pickItemId: input.pickItemId,
      restoredAt: null,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (consumptions.length === 0) {
    throw new Error('FIFO 退料失败：缺少成本层消耗明细')
  }

  for (const item of consumptions) {
    await tx.inventoryCostLayer.update({
      where: { id: item.costLayerId },
      data: {
        remainingStockQty: { increment: Number(item.stockQty) },
        remainingValuationQty: { increment: Number(item.valuationQty) },
        remainingAmount: { increment: Number(item.costAmount) },
        status: 'OPEN',
      },
    })
  }

  await tx.costLayerConsumption.updateMany({
    where: {
      pickItemId: input.pickItemId,
      restoredAt: null,
    },
    data: { restoredAt: new Date() },
  })
}
