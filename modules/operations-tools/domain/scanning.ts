export function normalizeScanCode(value: string) {
  return value.trim().replace(/[\r\n\t]/g, '').toUpperCase()
}

export function scanCodesMatch(left: string, right: string) {
  return normalizeScanCode(left) === normalizeScanCode(right)
}

export function classifyScan(input: {
  rawValue: string
  expectedCode: string
  countedQty: number
  expectedQty: number
  quantity: number
}) {
  const code = normalizeScanCode(input.rawValue)
  const matches = scanCodesMatch(code, input.expectedCode)
  const over = matches && input.countedQty + input.quantity > input.expectedQty + 0.000001
  return {
    code,
    result: (!matches ? 'UNKNOWN' : over ? 'OVER' : 'MATCHED') as 'UNKNOWN' | 'OVER' | 'MATCHED',
  }
}

export function scanCountCompletionError(input: { countedQty: number; expectedQty: number }) {
  return Math.abs(input.countedQty - input.expectedQty) > 0.000001
    ? '扫码数量与发货数量不一致，不能完成计数'
    : null
}

export function scanSessionNumber(now = new Date(), random = Math.random()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14)
  return `SC-${stamp}-${random.toString(36).slice(2, 6).toUpperCase()}`
}

export function labelPrintJobNumber(now = new Date(), random = Math.random()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14)
  return `LP-${stamp}-${random.toString(36).slice(2, 6).toUpperCase()}`
}
