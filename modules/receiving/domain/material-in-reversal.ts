const tolerance = 0.000001

export function isMaterialInCostLayerUntouched(
  layer: {
    stockQty: number
    remainingStockQty: number
    valuationQty: number
    remainingValuationQty: number
    totalAmount: number
    remainingAmount: number | null
  },
  activeConsumptionCount: number,
) {
  return Math.abs(Number(layer.remainingStockQty) - Number(layer.stockQty)) <= tolerance
    && Math.abs(Number(layer.remainingValuationQty) - Number(layer.valuationQty)) <= tolerance
    && Math.abs(Number(layer.remainingAmount ?? layer.totalAmount) - Number(layer.totalAmount)) <= tolerance
    && activeConsumptionCount === 0
}

export function calculateMaterialInReversal(input: {
  stockQty: number
  availableQty: number
  valuationQty: number
  availableValuationQty: number
  totalCost: number
  receiptQty: number
  receiptValuationQty: number
  receiptCost: number
  hasCostLayer: boolean
}) {
  if (input.availableQty + tolerance < input.receiptQty
    || input.availableValuationQty + tolerance < input.receiptValuationQty) {
    throw new Error('可用库存不足，不能红冲该来料单')
  }
  if (input.hasCostLayer && input.totalCost + tolerance < input.receiptCost) {
    throw new Error('库存金额不足，不能红冲该来料单')
  }
  const reverseCostAmount = input.hasCostLayer
    ? input.receiptCost
    : Math.min(input.receiptCost, Math.max(0, input.totalCost))
  const afterQty = Number((input.stockQty - input.receiptQty).toFixed(6))
  const afterValuationQty = Number((input.valuationQty - input.receiptValuationQty).toFixed(6))
  const afterCostAmount = Number(Math.max(0, input.totalCost - reverseCostAmount).toFixed(6))
  return {
    reverseCostAmount,
    afterQty,
    afterValuationQty,
    afterCostAmount,
    valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
    stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
  }
}
