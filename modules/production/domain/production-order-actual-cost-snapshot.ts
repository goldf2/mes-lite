import { z } from 'zod'
import { ProductionOrderDomainError } from './production-order-errors'

const productionActualCostLayerSnapshotSchema = z.array(z.object({
  costLayerId: z.string().min(1),
  stockQty: z.number().finite().nonnegative(),
  valuationQty: z.number().finite().nonnegative(),
  costAmount: z.number().finite().nonnegative(),
}))

export type ProductionActualCostLayerSnapshot = z.infer<typeof productionActualCostLayerSnapshotSchema>[number]

export function parseProductionActualCostLayerSnapshot(value?: string | null): ProductionActualCostLayerSnapshot[] {
  if (!value) return []
  try {
    return productionActualCostLayerSnapshotSchema.parse(JSON.parse(value))
  } catch {
    throw new ProductionOrderDomainError('历史成本层快照损坏，无法自动冲销')
  }
}
