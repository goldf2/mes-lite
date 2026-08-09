import type { MaterialInFormState, ReceivingMaterialOption } from '../contracts/material-in'

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
    pieceCount: 0,
    stockQtyMode: 'TOTAL',
    stockQtyInput: 0,
    totalLength: 0,
    totalWeight: 0,
    unitPrice: 0,
    priceUnit: 'm',
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
