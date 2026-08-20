import type {
  MaterialInFormState,
  MaterialInLineRecord,
  MaterialInRecord,
  MaterialInSavePayload,
  ReceivingMaterialOption,
} from '../contracts/material-in'

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

function normalizedSaveText(value: string | null | undefined) {
  return value?.trim() || ''
}

function sameSaveNumber(left: number | null | undefined, right: number | null | undefined) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.000001
}

export function materialInRecordMatchesSavePayload(record: MaterialInRecord, payload: MaterialInSavePayload) {
  if (record.supplierId !== payload.supplierId) return false
  if (record.stagingLocationId !== (payload.stagingLocationId || record.stagingLocationId)) return false
  if (normalizedSaveText(record.voucherNo) !== normalizedSaveText(payload.voucherNo)) return false
  if (normalizedSaveText(record.receivedBy) !== normalizedSaveText(payload.receivedBy)) return false
  if (normalizedSaveText(record.note) !== normalizedSaveText(payload.note)) return false

  const recordItems = [...record.items].sort((left, right) => left.lineNo - right.lineNo)
  if (recordItems.length !== payload.items.length) return false
  return payload.items.every((item, index) => {
    const line = recordItems[index]
    const expectedLocationId = item.locationId || payload.stagingLocationId || record.stagingLocationId
    if (line.materialId !== item.materialId || line.locationId !== expectedLocationId) return false
    if (!sameSaveNumber(line.qty, item.qty)) return false
    if (item.valuationQty && item.valuationQty > 0) {
      if (!sameSaveNumber(line.valuationQty, item.valuationQty)) return false
    } else if (line.conversionSource === 'DOCUMENT_ACTUAL') {
      return false
    }
    return line.unit === item.unit
      && line.valuationUnit === item.valuationUnit
      && sameSaveNumber(line.unitPrice, item.unitPrice)
      && sameSaveNumber(line.totalAmount, item.totalAmount)
      && normalizedSaveText(line.priceUnit) === normalizedSaveText(item.priceUnit)
      && line.priceBasis === item.priceBasis
      && normalizedSaveText(line.batchNo) === normalizedSaveText(item.batchNo)
  })
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
