import { resolveProcessCostRates, type ProcessCostFallbackRates } from './process-cost'

export type ProcessRouteSnapshotSource = {
  id: string
  name: string
  isDefault: boolean
  steps: Array<{
    id: string
    stepNo: number
    name: string
    templateCode?: string | null
    standardBatchQty: number
    setupTimeMinutes: number
    cycleTimeSeconds: number
    peopleCount: number
    laborRatePerHour: number
    machineCount: number
    machineRatePerHour: number
    energyCostPerHour: number
    consumableCostPerBatch: number
    yieldRate: number
    workCenter?: { id: string; code: string; name: string; laborRatePerHour?: number | null; machineRatePerHour?: number | null; energyCostPerHour?: number | null } | null
  }>
}

export function serializeProcessRouteSnapshot(route?: ProcessRouteSnapshotSource | null, fallbackRates?: ProcessCostFallbackRates) {
  if (!route) return null
  return JSON.stringify({
    id: route.id,
    name: route.name,
    isDefault: route.isDefault,
    steps: route.steps.map((step) => ({
      id: step.id,
      stepNo: step.stepNo,
      name: step.name,
      templateCode: step.templateCode || null,
      standardBatchQty: Number(step.standardBatchQty || 0),
      setupTimeMinutes: Number(step.setupTimeMinutes || 0),
      cycleTimeSeconds: Number(step.cycleTimeSeconds || 0),
      peopleCount: Number(step.peopleCount || 0),
      machineCount: Number(step.machineCount || 0),
      consumableCostPerBatch: Number(step.consumableCostPerBatch || 0),
      yieldRate: Number(step.yieldRate || 0),
      ...resolveProcessCostRates(step, fallbackRates),
      workCenter: step.workCenter ? {
        id: step.workCenter.id,
        code: step.workCenter.code,
        name: step.workCenter.name,
        laborRatePerHour: Number(step.workCenter.laborRatePerHour || 0),
        machineRatePerHour: Number(step.workCenter.machineRatePerHour || 0),
        energyCostPerHour: Number(step.workCenter.energyCostPerHour || 0),
      } : null,
    })),
  })
}
