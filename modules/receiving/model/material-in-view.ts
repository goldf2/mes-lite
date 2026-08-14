import type { MaterialInFormState, MaterialInLineRecord, ReceivingMaterialOption } from '../contracts/material-in'

export const materialInStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  RECEIVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVERSED: 'bg-orange-100 text-orange-700',
}

export const materialInStatusLabels: Record<string, string> = {
  PENDING: '待收货',
  RECEIVED: '已收货',
  REJECTED: '已拒收',
  REVERSED: '已红冲',
}

export const materialInStatusOptions = [
  { value: 'PENDING', label: '待收货' },
  { value: 'RECEIVED', label: '已收货' },
  { value: 'REJECTED', label: '已拒收' },
  { value: 'REVERSED', label: '已红冲' },
]

export function createEmptyMaterialInForm(locationId = ''): MaterialInFormState {
  return {
    voucherNo: '',
    supplierId: '',
    materialId: '',
    locationId,
    qty: 0,
    valuationQty: 0,
    unitPrice: 0,
    priceUnit: '件',
    totalAmount: 0,
    priceInputMode: 'UNIT',
    batchNo: '',
    receivedBy: '',
    note: '',
  }
}

export function formatReceivingMaterialLabel(material: ReceivingMaterialOption) {
  return `${material.code} · ${material.name}${material.spec ? ` · ${material.spec}` : ''}`
}

export function displayMaterialInPriceUnit(unit: string | null | undefined) {
  return unit === 'm' ? '米' : unit || '-'
}

export function materialInLineQualityStatus(line: MaterialInLineRecord) {
  const inspection = line.inventoryLot?.inspections?.[0]
  if (!inspection) return null
  if (inspection.status === 'PENDING') return { label: '待质量检验', className: 'bg-amber-100 text-amber-800', inspectionNo: inspection.inspectionNo }
  if (inspection.status === 'CANCELLED') return { label: '质量任务已取消', className: 'bg-gray-100 text-gray-600', inspectionNo: inspection.inspectionNo }
  if (inspection.result === 'PASS') return { label: '质量已放行', className: 'bg-emerald-100 text-emerald-800', inspectionNo: inspection.inspectionNo }
  if (inspection.result === 'PARTIAL') return { label: '质量部分判定', className: 'bg-orange-100 text-orange-800', inspectionNo: inspection.inspectionNo }
  return { label: '质量已冻结', className: 'bg-red-100 text-red-800', inspectionNo: inspection.inspectionNo }
}
