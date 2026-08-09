export const businessDocumentStatusLabels: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待处理', CONFIRMED: '已确认', PARTIAL: '部分完成',
  COMPLETED: '已完成', CANCELLED: '已取消', SHIPPED: '已发货', DELIVERED: '已签收',
  PROCESSED: '已处理', REJECTED: '已拒绝', REVERSED: '已冲销', DISPATCHED: '已派工',
  IN_PROGRESS: '进行中',
}

export const businessDocumentPriorityLabels: Record<string, string> = {
  LOW: '低', NORMAL: '正常', HIGH: '高', URGENT: '紧急',
}

export function businessDocumentDateText(value?: Date | string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

export function businessDocumentNumberText(value: number) {
  return Number(value || 0).toFixed(3).replace(/\.?0+$/, '')
}

export function businessDocumentMoney(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`
}
