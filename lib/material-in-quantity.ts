const roundQty = (value: number) => Number(value.toFixed(6))

export function resolveMaterialInStockQuantity(input: {
  primaryMeasure: string
  qty: number
  pieceCount?: number | null
  stockQtyMode?: 'TOTAL' | 'PER_PIECE'
  stockQtyInput?: number | null
}) {
  if (input.primaryMeasure !== 'LENGTH') {
    return {
      qty: roundQty(input.qty),
      pieceCount: null,
      stockQtyMode: 'TOTAL' as const,
      stockQtyInput: roundQty(input.qty),
    }
  }

  const stockQtyMode = input.stockQtyMode || 'TOTAL'
  const stockQtyInput = Number(input.stockQtyInput || input.qty)
  const pieceCount = input.pieceCount ? Number(input.pieceCount) : null
  if (!Number.isFinite(stockQtyInput) || stockQtyInput <= 0) throw new Error('长度必须大于 0')
  if (pieceCount === null || !Number.isInteger(pieceCount) || pieceCount <= 0) {
    throw new Error('根数必须为正整数')
  }

  return {
    qty: roundQty(stockQtyMode === 'PER_PIECE' ? stockQtyInput * pieceCount : stockQtyInput),
    pieceCount,
    stockQtyMode,
    stockQtyInput: roundQty(stockQtyInput),
  }
}
