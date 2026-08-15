const movementLabels: Record<string, string> = {
  IN: '来料入库',
  REVERSE_IN: '来料入库冲销',
  PRODUCTION_CONSUME: '生产耗用',
  PRODUCTION_IN: '生产入库',
  PRODUCTION_REVERSE_OUT: '生产入库冲销',
  PRODUCTION_REVERSE_CONSUME: '生产耗用冲销',
  OUT: '发货出库',
  RETURN_IN: '退货入库',
  ADJUST: '库存调整',
  FLOW_TRANSFER_OUT: '库位转出',
  FLOW_TRANSFER_IN: '库位转入',
  FLOW_TRANSFER_REVERSE_OUT: '转移冲销转出',
  FLOW_TRANSFER_REVERSE_IN: '转移冲销转入',
  RETURN: '取消退料',
  STOCK_IN: '旧工单入库',
  PICK: '旧工单领料',
}

const referenceLabels: Record<string, string> = {
  MATERIAL_IN: '来料单',
  MATERIAL_IN_REVERSE: '来料冲销',
  PRODUCTION_ORDER_ACTUAL: '生产实绩',
  PRODUCTION_ORDER_ACTUAL_REVERSE: '生产实绩冲销',
  DAILY_PRODUCTION_REPORT: '历史生产日报',
  DAILY_PRODUCTION_REPORT_REVERSE: '历史生产日报冲销',
  SHIPMENT: '发货单',
  RETURN: '退货单',
  FLOW_TRANSFER: '流程转移',
  ADJUST: '库存调整',
  STOCK_IN: '历史入库单',
  PICK: '历史领料单',
}

const reversalMovementTypes = new Set([
  'REVERSE_IN',
  'PRODUCTION_REVERSE_OUT',
  'PRODUCTION_REVERSE_CONSUME',
  'FLOW_TRANSFER_REVERSE_OUT',
  'FLOW_TRANSFER_REVERSE_IN',
  'RETURN',
])

const shortMovementId = (value: string) => value.length > 10 ? `${value.slice(0, 8)}…` : value

export function stockMovementRelationLabel(movement: {
  type: string
  sourceMovementId: string | null
  reversalMovementId: string | null
}) {
  if (movement.reversalMovementId) return `已由流水 ${shortMovementId(movement.reversalMovementId)} 冲销`
  if (!movement.sourceMovementId) return '-'
  return reversalMovementTypes.has(movement.type)
    ? `冲销原流水 ${shortMovementId(movement.sourceMovementId)}`
    : `关联来源流水 ${shortMovementId(movement.sourceMovementId)}`
}

export function stockMovementTypeLabel(value: string) {
  return movementLabels[value] || value.replaceAll('_', ' ')
}

export function stockMovementReferenceLabel(value: string) {
  return referenceLabels[value] || value.replaceAll('_', ' ')
}

export function stockMovementQuantityText(value: number | null, unit = '') {
  if (value === null || !Number.isFinite(value)) return '-'
  const text = Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
  return unit ? `${text} ${unit}` : text
}

export function stockMovementAmountText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-'
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function stockMovementTone(value: number) {
  if (value > 0) return 'bg-emerald-50 text-emerald-700'
  if (value < 0) return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

export function stockMovementTypeOptions(values: string[]) {
  return values.map((value) => ({ value, label: stockMovementTypeLabel(value) }))
}

export function stockMovementReferenceOptions(values: string[]) {
  return values.map((value) => ({ value, label: stockMovementReferenceLabel(value) }))
}
