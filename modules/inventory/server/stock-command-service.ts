import { prisma } from '@/lib/prisma'
import { postStockLocationAdjustment } from '@/lib/stock-adjustment'
import type { StockAdjustmentCommand } from '../contracts/stock-route'
import { backfillMissingStockRecords } from './stock-integrity-service'
import { assertInventoryLocationDataScope, type EffectiveDataScope } from '@/modules/identity-access'

export function repairStockRecords() {
  return backfillMissingStockRecords()
}

export function adjustStock(input: StockAdjustmentCommand, scope: EffectiveDataScope) {
  assertInventoryLocationDataScope(scope, [input.locationId])
  return prisma.$transaction((tx) => postStockLocationAdjustment(tx, input))
}
