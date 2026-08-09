import { ProductionOrderDomainError } from './production-order-errors'

export type ProductionOrderBomSnapshot = {
  id: string
  name: string
  version: string
  outputQuantity: number
  outputUnit: string
  outputs: Array<{
    id: string
    materialId: string
    quantity: number
    unit: string
    isPrimary: boolean
    material: { code: string; name: string; stockUnit: string; unit: string }
  }>
  items: Array<{
    id: string
    materialId: string
    outputMaterialId?: string | null
    quantity: number
    unit: string
    material: { code: string; name: string; stockUnit: string; unit: string }
  }>
}

export function parseProductionOrderBomSnapshot(value?: string | null): ProductionOrderBomSnapshot {
  if (!value) throw new ProductionOrderDomainError('生产订单没有 BOM 快照，请重新创建生产订单')
  let snapshot: ProductionOrderBomSnapshot
  try {
    snapshot = JSON.parse(value) as ProductionOrderBomSnapshot
  } catch {
    throw new ProductionOrderDomainError('生产订单 BOM 快照损坏，请重新创建生产订单')
  }
  if (!snapshot.id || !Array.isArray(snapshot.outputs) || !Array.isArray(snapshot.items)) {
    throw new ProductionOrderDomainError('生产订单 BOM 快照损坏，请重新创建生产订单')
  }
  if (snapshot.outputs.filter((output) => output.isPrimary).length !== 1) {
    throw new ProductionOrderDomainError('生产订单 BOM 快照必须且只能包含一项主产出')
  }
  if (snapshot.items.length === 0) throw new ProductionOrderDomainError('生产订单 BOM 快照没有投入明细')
  return snapshot
}
