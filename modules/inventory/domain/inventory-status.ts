export const inventoryStatuses = ['AVAILABLE', 'QUARANTINE', 'HOLD', 'REWORK'] as const
export type InventoryStatus = (typeof inventoryStatuses)[number]

export function inventoryStatusLabel(status: string) {
  if (status === 'AVAILABLE') return '可用'
  if (status === 'QUARANTINE') return '待检'
  if (status === 'HOLD') return '冻结'
  if (status === 'REWORK') return '返工中'
  return status
}

export function assertInventoryStatus(status: string): asserts status is InventoryStatus {
  if (!inventoryStatuses.includes(status as InventoryStatus)) {
    throw new Error(`不支持的库存状态：${status}`)
  }
}
