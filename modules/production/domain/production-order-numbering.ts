export function buildProductionOrderGroupNo(now: Date, existingOrderCount: number) {
  if (!Number.isInteger(existingOrderCount) || existingOrderCount < 0) {
    throw new Error('当日生产订单数量必须是非负整数')
  }
  const dateCode = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `WO-${dateCode}-${String(existingOrderCount + 1).padStart(3, '0')}`
}

export function buildProductionOrderNo(groupNo: string, zeroBasedLineIndex: number) {
  if (!Number.isInteger(zeroBasedLineIndex) || zeroBasedLineIndex < 0) {
    throw new Error('生产订单行号必须是非负整数')
  }
  return zeroBasedLineIndex === 0
    ? groupNo
    : `${groupNo}-${String(zeroBasedLineIndex + 1).padStart(2, '0')}`
}
