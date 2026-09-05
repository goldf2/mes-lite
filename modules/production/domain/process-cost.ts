export interface ProcessCostInput {
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
}

/** Returns standard cost and time for 1,000 good units. */
export function calculateProcessCostPerThousand(item: ProcessCostInput) {
  const yieldRate = Math.max(0.0001, Number(item.yieldRate || 1))
  const batchQty = Math.max(1, Number(item.standardBatchQty || 1000))
  const runtimeHours = (1000 / yieldRate) * Number(item.cycleTimeSeconds || 0) / 3600
  const setupHours = Number(item.setupTimeMinutes || 0) / 60 * (1000 / batchQty)
  const baseHours = runtimeHours + setupHours
  const laborHours = baseHours * Number(item.peopleCount || 0)
  const machineHours = baseHours * Number(item.machineCount || 0)
  const laborCost = laborHours * Number(item.laborRatePerHour || 0)
  const machineCost = machineHours * (Number(item.machineRatePerHour || 0) + Number(item.energyCostPerHour || 0))
  const directCost = Number(item.consumableCostPerBatch || 0) * (1000 / batchQty)
  return {
    laborHours,
    machineHours,
    laborCost,
    machineCost,
    directCost,
    cost: laborCost + machineCost + directCost,
  }
}
