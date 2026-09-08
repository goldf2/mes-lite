import type { ProductionOrderCostSnapshot } from './production-order-execution-snapshots'
import { ProductionOrderDomainError } from './production-order-errors'

const roundCost = (value: number) => Number(value.toFixed(6))

export type AppliedProductionCostLine = {
  id: string
  lineType: string
  sourceId: string | null
  code: string | null
  name: string
  quantity: number
  unit: string
  plannedMaterialCost: number
  plannedValueAddedCost: number
  plannedTotalCost: number
  appliedMaterialCost: number
  appliedValueAddedCost: number
  appliedTotalCost: number
}

export type AppliedProductionCostSnapshot = {
  schemaVersion: 1
  mode: 'FROZEN_BOM_COST' | 'MATERIAL_ONLY'
  sourceRunId: string | null
  sourceBomId: string | null
  sourceBomVersion: string | null
  sourceProcessRouteId: string | null
  sourceProcessRouteName: string | null
  quantityBasis: number | null
  actualPrimaryOutputQty: number
  scalingFactor: number
  actualMaterialCost: number
  appliedValueAddedCost: number
  appliedTotalCost: number
  lines: AppliedProductionCostLine[]
}

export type AppliedProductionCost = {
  actualMaterialCost: number
  processCost: number
  totalCost: number
  snapshot: AppliedProductionCostSnapshot
}

/**
 * Applies a frozen BOM cost run to the actual primary output.
 *
 * Inventory issues already carry the actual material valuation. Therefore the
 * material portion of a frozen cost line is retained for audit but is not
 * added again; only value-added cost (labour, machine/energy, consumables and
 * overhead) is scaled and added to the finished output.
 */
export function calculateAppliedProductionCost(
  costSnapshot: ProductionOrderCostSnapshot | null,
  actualPrimaryOutputQty: number,
  actualMaterialCost: number,
): AppliedProductionCost {
  const actualQty = Number(actualPrimaryOutputQty)
  if (!Number.isFinite(actualQty) || actualQty <= 0) {
    throw new ProductionOrderDomainError('实际主产出数量必须大于 0，无法计算生产成本')
  }
  const materialCost = roundCost(Math.max(0, Number(actualMaterialCost) || 0))
  if (!costSnapshot) {
    const snapshot: AppliedProductionCostSnapshot = {
      schemaVersion: 1,
      mode: 'MATERIAL_ONLY',
      sourceRunId: null,
      sourceBomId: null,
      sourceBomVersion: null,
      sourceProcessRouteId: null,
      sourceProcessRouteName: null,
      quantityBasis: null,
      actualPrimaryOutputQty: roundCost(actualQty),
      scalingFactor: 1,
      actualMaterialCost: materialCost,
      appliedValueAddedCost: 0,
      appliedTotalCost: materialCost,
      lines: [],
    }
    return { actualMaterialCost: materialCost, processCost: 0, totalCost: materialCost, snapshot }
  }

  const quantityBasis = Number(costSnapshot.quantityBasis)
  if (!Number.isFinite(quantityBasis) || quantityBasis <= 0) {
    throw new ProductionOrderDomainError('冻结成本快照的成本基准无效，无法计算实际生产成本')
  }
  const scalingFactor = actualQty / quantityBasis
  const lines = costSnapshot.lines.map((line) => {
    const plannedMaterialCost = roundCost(Math.max(0, Number(line.materialCost) || 0))
    const plannedTotalCost = roundCost(Math.max(0, Number(line.totalCost) || 0))
    const plannedValueAddedCost = roundCost(Math.max(0, plannedTotalCost - plannedMaterialCost))
    return {
      id: line.id,
      lineType: line.lineType,
      sourceId: line.sourceId,
      code: line.code,
      name: line.name,
      quantity: roundCost(Number(line.quantity || 0) * scalingFactor),
      unit: line.unit,
      plannedMaterialCost,
      plannedValueAddedCost,
      plannedTotalCost,
      appliedMaterialCost: roundCost(plannedMaterialCost * scalingFactor),
      appliedValueAddedCost: roundCost(plannedValueAddedCost * scalingFactor),
      appliedTotalCost: roundCost(plannedTotalCost * scalingFactor),
    }
  })
  const processCost = roundCost(lines.reduce((sum, line) => sum + line.appliedValueAddedCost, 0))
  const totalCost = roundCost(materialCost + processCost)
  const snapshot: AppliedProductionCostSnapshot = {
    schemaVersion: 1,
    mode: 'FROZEN_BOM_COST',
    sourceRunId: costSnapshot.runId,
    sourceBomId: costSnapshot.bomId,
    sourceBomVersion: costSnapshot.bomVersion,
    sourceProcessRouteId: costSnapshot.processRouteId,
    sourceProcessRouteName: costSnapshot.processRouteName,
    quantityBasis: roundCost(quantityBasis),
    actualPrimaryOutputQty: roundCost(actualQty),
    scalingFactor: roundCost(scalingFactor),
    actualMaterialCost: materialCost,
    appliedValueAddedCost: processCost,
    appliedTotalCost: totalCost,
    lines,
  }
  return { actualMaterialCost: materialCost, processCost, totalCost, snapshot }
}
