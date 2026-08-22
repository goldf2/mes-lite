import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { postStockLocationAdjustment, StockAdjustmentError } from '@/lib/stock-adjustment'
import type { DailyInventoryCountCommand, StockAdjustmentCommand } from '../contracts/stock-route'
import { backfillMissingStockRecords } from './stock-integrity-service'
import { consumeAvailableInventoryLotsForReference, createInventoryLotReceipt } from './inventory-status-service'
import { assertInventoryLocationDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export function repairStockRecords() {
  return backfillMissingStockRecords()
}

export function adjustStock(
  input: StockAdjustmentCommand,
  scope: EffectiveDataScope,
  adjustedBy: string,
  auditContext: AuditContext,
) {
  assertInventoryLocationDataScope(scope, [input.locationId])
  return prisma.$transaction(async (tx) => {
    const result = await postStockLocationAdjustment(tx, { ...input, adjustedBy })
    await createAuditLog(tx, auditContext, {
      action: 'ADJUST',
      entityType: 'STOCK',
      entityId: result.stock.id,
      entityLabel: result.stock.material?.code || result.stock.product?.sku || result.stock.id,
      beforeData: result.stock,
      afterData: {
        locationId: result.location.id,
        location: `${result.location.code} ${result.location.name}`,
        oldLocationQty: result.oldLocationQty,
        newLocationQty: result.newLocationQty,
        newQty: result.newQty,
        newValuationQty: result.newValuationQty,
        newTotalCost: result.newTotalCost,
        reason: input.reason,
        adjustedBy,
      },
    })
    return result
  })
}

const DAILY_COUNT_TOLERANCE = 0.000001
const roundDailyAmount = (value: number) => Number(value.toFixed(6))

export function reconcileDailyInventory(
  input: DailyInventoryCountCommand,
  scope: EffectiveDataScope,
  adjustedBy: string,
  auditContext: AuditContext,
) {
  assertInventoryLocationDataScope(scope, [input.locationId])
  const stockIds = input.items.map((item) => item.stockId)
  if (new Set(stockIds).size !== stockIds.length) throw new StockAdjustmentError('同一物品不能在一张库存盘点单中重复盘点')

  return prisma.$transaction(async (tx) => {
    const currentStocks = await tx.stock.findMany({
      where: { id: { in: stockIds } },
      select: {
        id: true,
        qty: true,
        totalCost: true,
        stockUnitCost: true,
        locationBalances: { where: { locationId: input.locationId }, select: { qty: true } },
      },
    })
    if (currentStocks.length !== stockIds.length) throw new StockAdjustmentError('盘点物品中存在已删除或无效的库存记录')
    const currentStockById = new Map(currentStocks.map((stock) => [stock.id, stock]))
    const reason = `库存盘点 ${input.countDate}：${input.reason.trim()}`
    const adjusted: Array<{ stockId: string; oldLocationQty: number; countedQty: number; difference: number }> = []
    let unchangedCount = 0

    for (const item of input.items) {
      const currentStock = currentStockById.get(item.stockId)!
      const oldLocationQty = Number(currentStock.locationBalances[0]?.qty || 0)
      const difference = Number((item.countedQty - oldLocationQty).toFixed(6))
      if (Math.abs(difference) <= DAILY_COUNT_TOLERANCE) {
        unchangedCount += 1
        continue
      }
      const currentQty = Number(currentStock.qty)
      const currentTotalCost = Number(currentStock.totalCost)
      const currentUnitCost = Number(currentStock.stockUnitCost) || (currentQty > DAILY_COUNT_TOLERANCE ? currentTotalCost / currentQty : 0)
      const targetTotalCost = Math.max(0, roundDailyAmount(currentTotalCost + difference * currentUnitCost))
      const result = await postStockLocationAdjustment(tx, {
        stockId: item.stockId,
        locationId: input.locationId,
        newLocationQty: item.countedQty,
        newTotalCost: targetTotalCost,
        reason,
        adjustedBy,
      })
      if (!result.stock.material) throw new StockAdjustmentError('库存盘点只支持物料库存')
      const valuationDifference = roundDailyAmount(result.newValuationQty - Number(result.stock.valuationQty))
      const costDifference = roundDailyAmount(result.newTotalCost - Number(result.stock.totalCost))
      if (difference < 0) {
        await consumeAvailableInventoryLotsForReference(tx, {
          materialId: result.stock.material.id,
          materialCode: result.stock.material.code,
          locationId: result.location.id,
          locationCode: result.location.code,
          stockQty: Math.abs(difference),
          issueValuationQty: Math.abs(valuationDifference),
          issueCostAmount: Math.abs(costDifference),
          refType: 'DAILY_INVENTORY_COUNT',
          refId: result.stockLog.id,
          transactionType: 'DAILY_COUNT_OUT',
          idempotencyPrefix: `DAILY_COUNT:${result.stockLog.id}`,
          note: reason,
          stockLogId: result.stockLog.id,
          createdBy: adjustedBy,
        })
      } else {
        await createInventoryLotReceipt(tx, {
          lotNo: `COUNT-${result.stockLog.id}`,
          materialId: result.stock.material.id,
          sourceType: 'DAILY_INVENTORY_COUNT',
          sourceId: result.stockLog.id,
          locationId: result.location.id,
          inventoryStatus: 'AVAILABLE',
          stockQty: difference,
          valuationQty: valuationDifference,
          costAmount: costDifference,
          stockLogId: result.stockLog.id,
          idempotencyKey: `DAILY_COUNT:${result.stockLog.id}:LOT`,
          note: reason,
          createdBy: adjustedBy,
        })
      }
      await createAuditLog(tx, auditContext, {
        action: 'RECONCILE',
        entityType: 'STOCK',
        entityId: result.stock.id,
        entityLabel: result.stock.material?.code || result.stock.product?.sku || result.stock.id,
        beforeData: { countDate: input.countDate, locationId: result.location.id, locationQty: oldLocationQty },
        afterData: {
          countDate: input.countDate,
          locationId: result.location.id,
          location: `${result.location.code} ${result.location.name}`,
          countedQty: item.countedQty,
          difference,
          reason: input.reason.trim(),
          adjustedBy,
        },
        note: '库存盘点校准；不创建生产实绩或质量记录',
      })
      adjusted.push({ stockId: item.stockId, oldLocationQty, countedQty: item.countedQty, difference })
    }

    return { countDate: input.countDate, locationId: input.locationId, adjusted, unchangedCount }
  })
}
