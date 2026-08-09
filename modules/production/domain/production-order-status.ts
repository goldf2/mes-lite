export function confirmedProductionOrderStatus(pickCount: number) {
  return pickCount === 0 ? 'PICKED' : 'CONFIRMED'
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
