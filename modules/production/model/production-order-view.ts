import type { ProductionOrder, ProductionOrderDraftLine } from '../contracts/production-order'

export const productionMaterialCategoryLabels: Record<string, string> = {
  RAW: '原材料', FINISHED: '成品', AUXILIARY: '辅材', SCRAP: '废料',
  DEFECTIVE: '废品', PACKAGING: '包装物', OTHER: '其他',
}

export const productionOrderStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PICKED: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-orange-100 text-orange-700',
  QC_WAITING: 'bg-purple-100 text-purple-700',
  QC_DONE: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

export const productionOrderStatusLabels: Record<string, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', PICKED: '已领料', RUNNING: '生产中',
  QC_WAITING: '待质检', QC_DONE: '质检完成', COMPLETED: '已完成', CANCELLED: '已取消',
}

export const productionOrderStatusOptions = Object.entries(productionOrderStatusLabels).map(([value, label]) => ({ value, label }))

export function displayProductionMaterialCode(code?: string | null) {
  return code?.startsWith('MAT-') ? code.slice(4) : code || ''
}

export function groupProductionOrders(orders: ProductionOrder[]) {
  return Array.from(orders.reduce((groups, order) => {
    const key = order.groupNo || order.orderNo
    const current = groups.get(key) || []
    current.push(order)
    groups.set(key, current)
    return groups
  }, new Map<string, ProductionOrder[]>())).map(([groupNo, lines]) => ({
    groupNo,
    lines: [...lines].sort((left, right) => Number(left.lineNo || 1) - Number(right.lineNo || 1)),
  }))
}

export function buildProductionOrderCreateInput(lines: ProductionOrderDraftLine[], voucherNo: string, note: string) {
  return {
    items: lines.map(({ id: _id, ...line }) => line),
    voucherNo: voucherNo || undefined,
    note: note || undefined,
  }
}
