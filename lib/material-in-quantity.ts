const roundQty = (value: number) => Number(value.toFixed(6))

export const materialInPriceUnits = ['m', 'kg', '件'] as const
export type MaterialInPriceUnit = typeof materialInPriceUnits[number]

export function normalizeMaterialInPriceUnit(value: unknown, measure = 'QUANTITY'): MaterialInPriceUnit {
  const normalized = String(value || '').trim().toLocaleLowerCase()
  if (normalized === 'm' || normalized === '米') return 'm'
  if (normalized === 'kg' || normalized === '千克' || normalized === '公斤') return 'kg'
  if (normalized === '件' || normalized === '个' || normalized === '根') return '件'
  if (measure === 'LENGTH') return 'm'
  if (measure === 'WEIGHT') return 'kg'
  return '件'
}

function optionalPositive(value: number | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? roundQty(parsed) : null
}

export function resolveMaterialInStockQuantity(input: {
  primaryMeasure: string
  qty: number
  pieceCount?: number | null
  stockQtyMode?: 'TOTAL' | 'PER_PIECE'
  stockQtyInput?: number | null
  totalLength?: number | null
  totalWeight?: number | null
}) {
  const requestedPieceCount = optionalPositive(input.pieceCount)
  const pieceCount = requestedPieceCount && Number.isInteger(requestedPieceCount)
    ? requestedPieceCount
    : null
  const requestedTotalLength = optionalPositive(input.totalLength)
  const requestedTotalWeight = optionalPositive(input.totalWeight)

  if (input.primaryMeasure !== 'LENGTH') {
    const fallbackQty = roundQty(input.qty)
    const qty = input.primaryMeasure === 'WEIGHT'
      ? requestedTotalWeight || fallbackQty
      : input.primaryMeasure === 'QUANTITY'
        ? pieceCount || fallbackQty
        : fallbackQty
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('主库存数量必须大于 0')

    return {
      qty,
      pieceCount: pieceCount || (input.primaryMeasure === 'QUANTITY' && Number.isInteger(qty) ? qty : null),
      stockQtyMode: 'TOTAL' as const,
      stockQtyInput: qty,
      totalLength: input.primaryMeasure === 'LENGTH' ? qty : requestedTotalLength,
      totalWeight: input.primaryMeasure === 'WEIGHT' ? qty : requestedTotalWeight,
    }
  }

  const stockQtyMode = input.stockQtyMode || 'TOTAL'
  const stockQtyInput = Number(input.stockQtyInput || requestedTotalLength || input.qty)
  if (!Number.isFinite(stockQtyInput) || stockQtyInput <= 0) throw new Error('长度必须大于 0')
  if (pieceCount === null || !Number.isInteger(pieceCount) || pieceCount <= 0) {
    throw new Error('数量必须为正整数')
  }

  const qty = roundQty(stockQtyMode === 'PER_PIECE' ? stockQtyInput * pieceCount : stockQtyInput)

  return {
    qty,
    pieceCount,
    stockQtyMode,
    stockQtyInput: roundQty(stockQtyInput),
    totalLength: qty,
    totalWeight: requestedTotalWeight,
  }
}

export function resolveMaterialInPricing(input: {
  priceUnit: MaterialInPriceUnit
  priceBasis?: 'VALUATION' | 'STOCK'
  priceQuantity?: number | null
  unitPrice: number
  totalAmount?: number | null
  totalLength?: number | null
  totalWeight?: number | null
  pieceCount?: number | null
}) {
  const unitPrice = Number(input.unitPrice || 0)
  const requestedTotalAmount = input.totalAmount === undefined || input.totalAmount === null
    ? null
    : Number(input.totalAmount)
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('单价不能为负')
  if (requestedTotalAmount !== null && (!Number.isFinite(requestedTotalAmount) || requestedTotalAmount < 0)) {
    throw new Error('总价格不能为负')
  }

  const priceQuantity = input.priceQuantity === undefined || input.priceQuantity === null
    ? input.priceUnit === 'm'
      ? Number(input.totalLength || 0)
      : input.priceUnit === 'kg'
        ? Number(input.totalWeight || 0)
        : Number(input.pieceCount || 0)
    : Number(input.priceQuantity)
  const hasMoney = unitPrice > 0 || Number(requestedTotalAmount || 0) > 0
  if (hasMoney && (!Number.isFinite(priceQuantity) || priceQuantity <= 0)) {
    throw new Error(`按 ${input.priceUnit} 计价时必须填写对应的长度、重量或数量`)
  }

  const totalAmount = requestedTotalAmount === null
    ? roundQty(priceQuantity * unitPrice)
    : roundQty(requestedTotalAmount)
  const normalizedUnitPrice = priceQuantity > 0
    ? roundQty(totalAmount / priceQuantity)
    : roundQty(unitPrice)

  return {
    priceUnit: input.priceUnit,
    priceBasis: input.priceBasis || (input.priceUnit === 'kg' ? 'VALUATION' as const : 'STOCK' as const),
    priceQuantity: roundQty(priceQuantity),
    unitPrice: normalizedUnitPrice,
    totalAmount,
  }
}
