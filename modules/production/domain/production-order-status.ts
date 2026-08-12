export const currentProductionOrderStatuses = [
  'DRAFT',
  'RELEASED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

const productionOrderStatusAliases: Record<string, string[]> = {
  DRAFT: ['DRAFT'],
  RELEASED: ['RELEASED', 'CONFIRMED', 'PICKED', 'DISPATCHED'],
  IN_PROGRESS: ['IN_PROGRESS', 'RUNNING', 'QC_WAITING', 'QC_DONE'],
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['CANCELLED'],
}

export function normalizeProductionOrderStatus(status: string) {
  if (productionOrderStatusAliases.RELEASED.includes(status)) return 'RELEASED'
  if (productionOrderStatusAliases.IN_PROGRESS.includes(status)) return 'IN_PROGRESS'
  return status
}

export function expandProductionOrderStatusFilters(statuses: string[]) {
  return Array.from(new Set(statuses.flatMap((status) => (
    productionOrderStatusAliases[normalizeProductionOrderStatus(status)] || [status]
  ))))
}

export function normalizeProductionOrderStatusDistribution(items: Array<{ status: string; count: number }>) {
  const totals = new Map<string, number>()
  for (const item of items) {
    const status = normalizeProductionOrderStatus(item.status)
    totals.set(status, (totals.get(status) || 0) + Number(item.count || 0))
  }
  return Array.from(totals, ([status, count]) => ({ status, count }))
}

export function releasedProductionOrderStatus(materialId: string | null | undefined, pickCount: number) {
  if (materialId) return 'RELEASED'
  return pickCount === 0 ? 'PICKED' : 'CONFIRMED'
}

export function productionOrderReleaseError(materialId: string | null | undefined, pickCount: number) {
  return materialId && pickCount > 0
    ? '生产订单存在历史领料项，必须先完成数据治理再发布'
    : null
}

export function productionOrderStatusAfterActual(
  materialId: string | null | undefined,
  completed: boolean,
  hasConfirmedActual: boolean,
) {
  if (completed) return 'COMPLETED'
  if (materialId) return hasConfirmedActual ? 'IN_PROGRESS' : 'RELEASED'
  return hasConfirmedActual ? 'RUNNING' : 'DRAFT'
}

export function productionOrderActualCreationError(status: string, materialId: string | null | undefined) {
  if (!materialId) return '历史工单不能新增班后生产实绩，请使用历史兼容流程完成收尾'
  const normalized = normalizeProductionOrderStatus(status)
  if (normalized === 'DRAFT') return '请先发布生产订单，再登记班后生产实绩'
  if (normalized === 'CANCELLED' || normalized === 'COMPLETED') return '已取消或已完成的生产订单不能新增实绩'
  if (normalized === 'RELEASED' || normalized === 'IN_PROGRESS') return null
  return `生产订单状态为 ${status}，不能登记班后生产实绩`
}

export function productionOrderDispatchError(status: string, materialId: string | null | undefined) {
  const allowed = materialId
    ? ['RELEASED', 'IN_PROGRESS'].includes(normalizeProductionOrderStatus(status))
    : ['PICKED', 'RUNNING'].includes(status)
  return allowed ? null : `工单状态不允许派工：当前为 ${status}`
}

export function productionOrderConfirmationError(status: string) {
  return status === 'DRAFT' ? null : '只能确认草稿状态的生产订单'
}

export function productionOrderCancellationError(status: string, stockInCount: number) {
  if (status === 'COMPLETED') return '已入库工单不可取消，请先创建退货单'
  if (status === 'CANCELLED') return '工单已取消'
  if (stockInCount > 0) return '工单已有成品入库记录，不可取消'
  return null
}
