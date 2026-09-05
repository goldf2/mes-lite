import type { ProductionOrder, ProductionOrderDraftLine } from '../contracts/production-order'
import { currentProductionOrderStatuses } from '../domain/production-order-status'

export const productionMaterialCategoryLabels: Record<string, string> = {
  RAW: '原材料', FINISHED: '成品', AUXILIARY: '辅材', SCRAP: '废料',
  DEFECTIVE: '废品', PACKAGING: '包装物', OTHER: '其他',
}

export const productionOrderStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  RELEASED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-orange-100 text-orange-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PICKED: 'bg-blue-100 text-blue-700',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-orange-100 text-orange-700',
  QC_WAITING: 'bg-orange-100 text-orange-700',
  QC_DONE: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

export const productionOrderStatusLabels: Record<string, string> = {
  DRAFT: '草稿', RELEASED: '已发布', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消',
  CONFIRMED: '已发布', PICKED: '已发布', DISPATCHED: '已发布',
  RUNNING: '进行中', QC_WAITING: '进行中', QC_DONE: '进行中',
}

export const productionOrderStatusOptions = currentProductionOrderStatuses.map((value) => ({
  value,
  label: productionOrderStatusLabels[value],
}))

export function displayProductionMaterialCode(code?: string | null) {
  return code || ''
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
