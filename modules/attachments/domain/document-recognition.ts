export const documentRecognitionFieldPrompts: Record<string, string> = {
  MATERIAL_IN: 'voucherNo, supplier, material, qty, unit, unitPrice, totalAmount, batchNo, receivedBy, note',
  PRODUCTION_ORDER: 'voucherNo, material, qty, bom, note',
  DISPATCH: 'voucherNo, orderNo, processStep, workerName, workerId, planQty, priority, note',
  SALES_ORDER: 'voucherNo, customer, orderDate, deliveryDate, note, items（数组，每项含 material, qty, unitPrice）',
  SHIPMENT: 'voucherNo, salesOrderNo, material, customer, qty, trackingNo, address, shippedBy, note',
  RETURN_ORDER: 'voucherNo, shipmentNo, material, qty, reason, note',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function extractRecognitionJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || value.slice(value.indexOf('{'), value.lastIndexOf('}') + 1)
  const parsed = JSON.parse(candidate)
  if (!isRecord(parsed)) throw new Error('AI_DOCUMENT_INVALID_RESPONSE')
  return parsed
}

export function normalizeRecognitionResult(result: Record<string, unknown>) {
  const fields = isRecord(result.fields) ? result.fields : result
  const confidence = isRecord(result.confidence) ? result.confidence : {}
  const autoFilledFields = Object.fromEntries(Object.entries(fields).filter(([key, value]) => {
    const score = Number(confidence[key])
    const hasValue = Array.isArray(value) ? value.length > 0 : String(value ?? '').trim().length > 0
    return hasValue && Number.isFinite(score) && score >= 0.7
  }))
  const unrecognized = Array.isArray(result.unrecognized)
    ? result.unrecognized.filter((item): item is string => typeof item === 'string')
    : []
  return { fields, confidence, autoFilledFields, unrecognized }
}

export class DocumentRecognitionError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'DocumentRecognitionError'
  }
}
