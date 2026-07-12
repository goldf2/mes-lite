export function normalizeConversionRate(value: unknown) {
  const rate = Number(value)
  return Number.isFinite(rate) && rate > 0 ? rate : 1
}

export function toValuationQty(stockQty: number, conversionRate: number) {
  return Number((stockQty * normalizeConversionRate(conversionRate)).toFixed(6))
}

export function toStockQty(valuationQty: number, conversionRate: number) {
  return Number((valuationQty / normalizeConversionRate(conversionRate)).toFixed(6))
}

export function resolveMaterialUnits(material: {
  unit: string
  stockUnit?: string | null
  valuationUnit?: string | null
  conversionRate?: number | null
}) {
  return {
    stockUnit: material.stockUnit || material.unit,
    valuationUnit: material.valuationUnit || material.unit,
    conversionRate: normalizeConversionRate(material.conversionRate),
  }
}
