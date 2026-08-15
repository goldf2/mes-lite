import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit'
import { postStockLocationAdjustment } from '@/lib/stock-adjustment'
import type { StockAdjustmentCommand } from '../contracts/stock-route'
import { backfillMissingStockRecords } from './stock-integrity-service'
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
