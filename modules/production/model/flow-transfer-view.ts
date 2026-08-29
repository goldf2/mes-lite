import type { FlowTransferForm, FlowTransferLocationOption, FlowTransferStatus } from '../contracts/flow-transfer'

export const flowTransferToday = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export const createEmptyFlowTransferForm = (): FlowTransferForm => ({
  transferDate: flowTransferToday(),
  materialId: '',
  sourceLocationId: '',
  targetLocationId: '',
  quantity: 0,
  employeeId: '',
  note: '',
})

export function flowTransferFormError(form: FlowTransferForm) {
  if (!form.materialId) return '请选择转移物料'
  if (!form.sourceLocationId || !form.targetLocationId) return '请选择来源和目标库位'
  if (form.sourceLocationId === form.targetLocationId) return '来源库位和目标库位不能相同'
  if (Number(form.quantity) <= 0) return '转移数量必须大于 0'
  if (!form.employeeId) return '请选择操作员工'
  return ''
}

export const flowTransferStatusMeta: Record<FlowTransferStatus, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  CONFIRMED: { label: '已确认', className: 'bg-emerald-50 text-emerald-700' },
  REVERSED: { label: '已冲销', className: 'bg-red-50 text-red-700' },
}

export const flowTransferNumberText = (value: number, digits = 3) =>
  Number(value || 0).toFixed(digits).replace(/\.?0+$/, '')

export const flowTransferLocationLabel = (location: Pick<FlowTransferLocationOption, 'code' | 'name'>) =>
  `${location.code} · ${location.name}`
