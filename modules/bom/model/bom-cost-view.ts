export const bomCostLineTypeLabels: Record<string, string> = {
  BOM_MATERIAL: '物料', BOM_COST_OBJECT: '成本对象', OVERHEAD: '固定费用',
}

export const processCategoryLabels: Record<string, string> = {
  SAWING: '锯切', DRILLING: '钻孔', TURNING: '车削', MILLING: '铣削', GRINDING: '磨削',
  HEAT_TREATMENT: '热处理', SURFACE_TREATMENT: '表面处理', ASSEMBLY: '装配',
  INSPECTION: '检验', OTHER: '其他',
}

export function formatBomCostMoney(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`
}

export function formatBomCostQuantity(value: number, digits = 3) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')
}

export function formatBomCostDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function processCostPerThousand(item: {
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
}) {
  const yieldRate = Math.max(0.0001, Number(item.yieldRate || 1))
  const batchQty = Math.max(1, Number(item.standardBatchQty || 1000))
  const runtimeHours = (1000 / yieldRate) * Number(item.cycleTimeSeconds || 0) / 3600
  const setupHours = Number(item.setupTimeMinutes || 0) / 60 * (1000 / batchQty)
  const baseHours = runtimeHours + setupHours
  const laborHours = baseHours * Number(item.peopleCount || 0)
  const machineHours = baseHours * Number(item.machineCount || 0)
  const cost = laborHours * Number(item.laborRatePerHour || 0)
    + machineHours * (Number(item.machineRatePerHour || 0) + Number(item.energyCostPerHour || 0))
    + Number(item.consumableCostPerBatch || 0) * (1000 / batchQty)
  return { laborHours, machineHours, cost }
}
