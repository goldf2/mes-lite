import type { SalesOrderDraftLine } from '../contracts/sales-order'

export const salesOrderStatusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'PARTIAL', label: '部分发货' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

export const salesOrderStatusMeta: Record<string, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: '已确认', className: 'bg-blue-50 text-blue-700' },
  PARTIAL: { label: '部分发货', className: 'bg-amber-50 text-amber-700' },
  COMPLETED: { label: '已完成', className: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: '已取消', className: 'bg-red-50 text-red-700' },
}

export function createSalesOrderDraftLine(): SalesOrderDraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materialId: '',
    qty: 0,
    unitPrice: 0,
    note: '',
  }
}

export function localDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const numberText = (value: number) => Number(value || 0).toFixed(3).replace(/\.?0+$/, '')
export const money = (value: number) => `¥${Number(value || 0).toFixed(2)}`
export const dateText = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN') : '-'
