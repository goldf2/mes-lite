export function normalizeScanCode(value: string) {
  const normalized = value.trim().replace(/[\r\n\t]/g, '').toUpperCase()
  return normalized.startsWith('MAT-') ? normalized.slice(4) : normalized
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
