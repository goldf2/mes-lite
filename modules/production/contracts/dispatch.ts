export interface DispatchOrder {
  id: string
  orderNo: string
  status: string
  planQty: number
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  targetMaterial?: { id: string; name: string; code: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null } | null
}

export interface DispatchCustomer {
  id: string
  code: string
  name: string
}

export interface DispatchProcessStep {
  id: string
  stepNo: number
  name: string
  workstation: string | null
}

export interface DispatchRecord {
  id: string
  dispatchNo: string
  voucherNo?: string | null
  orderId: string
  stepId: string
  workerName: string
  workerId?: string
  planQty: number
  priority: string
  status: string
  note?: string
  createdAt: string
  order: DispatchOrder
  step: DispatchProcessStep
}

export interface DispatchFormInput {
  orderId: string
  voucherNo?: string
  stepId: string
  workerName: string
  workerId?: string
  planQty: number
  priority: string
  note?: string
}

export const dispatchStatusOptions = [
  { value: 'PENDING', label: '待派工' },
  { value: 'DISPATCHED', label: '已派工' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

export const dispatchStatusLabels: Record<string, string> = Object.fromEntries(
  dispatchStatusOptions.map((option) => [option.value, option.label]),
)

export const dispatchStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700', DISPATCHED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-orange-100 text-orange-700', COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

export const dispatchPriorityLabels: Record<string, string> = {
  LOW: '低', NORMAL: '正常', HIGH: '高', URGENT: '紧急',
}

export const dispatchPriorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700', NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
}
