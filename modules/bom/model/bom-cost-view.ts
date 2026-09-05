export const bomCostLineTypeLabels: Record<string, string> = {
  BOM_MATERIAL: '物料', BOM_COST_OBJECT: '成本对象', PROCESS_OPERATION: '加工工序', OVERHEAD: '固定费用',
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

export { calculateProcessCostPerThousand as processCostPerThousand } from '@/modules/production/domain/process-cost'
