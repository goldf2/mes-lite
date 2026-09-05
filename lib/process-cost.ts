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
  workCenter?: ProcessCostRateDefaults | null
}

export interface ProcessCostRateDefaults {
  laborRatePerHour?: number | null
  machineRatePerHour?: number | null
  energyCostPerHour?: number | null
}

export interface ProcessCostFallbackRates {
  laborRatePerHour?: number | null
  machineRatePerHour?: number | null
  energyCostPerHour?: number | null
}

function positiveOrZero(value: unknown) {
  const number = Number(value || 0)
  return Number.isFinite(number) && number > 0 ? number : 0
}

/** 工序费率优先，其次工作中心默认费率，最后使用本次计算的页面级费率。 */
export function resolveProcessCostRates(input: Pick<ProcessCostInput, 'laborRatePerHour' | 'machineRatePerHour' | 'energyCostPerHour' | 'workCenter'>, fallback?: ProcessCostFallbackRates) {
  return {
    laborRatePerHour: positiveOrZero(input.laborRatePerHour) || positiveOrZero(input.workCenter?.laborRatePerHour) || positiveOrZero(fallback?.laborRatePerHour),
    machineRatePerHour: positiveOrZero(input.machineRatePerHour) || positiveOrZero(input.workCenter?.machineRatePerHour) || positiveOrZero(fallback?.machineRatePerHour),
    energyCostPerHour: positiveOrZero(input.energyCostPerHour) || positiveOrZero(input.workCenter?.energyCostPerHour) || positiveOrZero(fallback?.energyCostPerHour),
  }
}

/** Returns standard cost and time for 1,000 good units. */
export function calculateProcessCostPerThousand(item: ProcessCostInput) {
  const rates = resolveProcessCostRates(item)
  const yieldRate = Math.max(0.0001, Number(item.yieldRate || 1))
  const batchQty = Math.max(1, Number(item.standardBatchQty || 1000))
  const runtimeHours = (1000 / yieldRate) * Number(item.cycleTimeSeconds || 0) / 3600
  const setupHours = Number(item.setupTimeMinutes || 0) / 60 * (1000 / batchQty)
  const baseHours = runtimeHours + setupHours
  const laborHours = baseHours * Number(item.peopleCount || 0)
  const machineHours = baseHours * Number(item.machineCount || 0)
  const laborCost = laborHours * rates.laborRatePerHour
  const machineCost = machineHours * (rates.machineRatePerHour + rates.energyCostPerHour)
  const directCost = Number(item.consumableCostPerBatch || 0) * (1000 / batchQty)
  return {
    laborHours,
    machineHours,
    laborCost,
    machineCost,
    directCost,
    cost: laborCost + machineCost + directCost,
    ...rates,
  }
}
