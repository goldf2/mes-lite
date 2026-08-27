export const shipmentStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700', SHIPPED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700', REVERSED: 'bg-amber-100 text-amber-800',
}
export const shipmentStatusLabels: Record<string, string> = {
  PENDING: '待发货', SHIPPED: '已发货', DELIVERED: '已签收', CANCELLED: '已取消', REVERSED: '已冲销',
}
export const shipmentStatusOptions = Object.entries(shipmentStatusLabels).map(([value, label]) => ({ value, label }))

export const returnStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700', PROCESSED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
}
export const returnStatusLabels: Record<string, string> = {
  PENDING: '待收货', PROCESSED: '已收货', REJECTED: '已拒绝',
}
export const returnStatusOptions = Object.entries(returnStatusLabels).map(([value, label]) => ({ value, label }))
