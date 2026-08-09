export const STOCK_BALANCE_TOLERANCE = 0.000001

export interface StockLocationBalanceSnapshot {
  qty: number
  reservedQty: number
  availableQty: number
}

export interface StockBalanceSnapshot {
  qty: number
  reservedQty: number
  availableQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  totalCost: number
  hasMaterial: boolean
  hasProduct: boolean
  materialExists: boolean
  productExists: boolean
  locationBalances: StockLocationBalanceSnapshot[]
}

const balanceFields = [
  'qty', 'reservedQty', 'availableQty', 'valuationQty',
  'reservedValuationQty', 'availableValuationQty', 'totalCost',
] as const

export function hasStockBalance(stock: Record<string, unknown>) {
  return balanceFields.some((field) => Math.abs(Number(stock[field] || 0)) > STOCK_BALANCE_TOLERANCE)
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= STOCK_BALANCE_TOLERANCE
}

export function validateStockBalance(stock: StockBalanceSnapshot) {
  const reasons: string[] = []
  if (stock.hasMaterial === stock.hasProduct) reasons.push('库存记录必须且只能关联一个物料或内部兼容物料')
  if (stock.hasMaterial && !stock.materialExists) reasons.push('库存关联的物料档案不存在')
  if (stock.hasProduct && !stock.productExists) reasons.push('库存关联的内部兼容物料不存在')
  if (stock.qty < -STOCK_BALANCE_TOLERANCE || stock.reservedQty < -STOCK_BALANCE_TOLERANCE || stock.availableQty < -STOCK_BALANCE_TOLERANCE) reasons.push('库存数量不能为负数')
  if (stock.valuationQty < -STOCK_BALANCE_TOLERANCE || stock.reservedValuationQty < -STOCK_BALANCE_TOLERANCE || stock.availableValuationQty < -STOCK_BALANCE_TOLERANCE) reasons.push('核算库存不能为负数')
  if (stock.totalCost < -STOCK_BALANCE_TOLERANCE) reasons.push('库存金额不能为负数')
  if (stock.reservedQty - stock.qty > STOCK_BALANCE_TOLERANCE) reasons.push('预留库存不能大于库存')
  if (stock.reservedValuationQty - stock.valuationQty > STOCK_BALANCE_TOLERANCE) reasons.push('预留核算库存不能大于核算库存')
  if (!closeEnough(stock.availableQty, stock.qty - stock.reservedQty)) reasons.push('可用库存必须等于库存减预留')
  if (!closeEnough(stock.availableValuationQty, stock.valuationQty - stock.reservedValuationQty)) reasons.push('可用核算库存必须等于核算库存减预留核算库存')

  const locationQty = stock.locationBalances.reduce((sum, item) => sum + item.qty, 0)
  const locationReservedQty = stock.locationBalances.reduce((sum, item) => sum + item.reservedQty, 0)
  const locationAvailableQty = stock.locationBalances.reduce((sum, item) => sum + item.availableQty, 0)
  if (!closeEnough(locationQty, stock.qty)) reasons.push('各库位库存合计必须等于物料总库存')
  if (!closeEnough(locationReservedQty, stock.reservedQty)) reasons.push('各库位占用合计必须等于物料总占用')
  if (!closeEnough(locationAvailableQty, stock.availableQty)) reasons.push('各库位可用合计必须等于物料总可用')
  if (stock.locationBalances.some((item) =>
    item.qty < -STOCK_BALANCE_TOLERANCE
    || item.reservedQty < -STOCK_BALANCE_TOLERANCE
    || !closeEnough(item.availableQty, item.qty - item.reservedQty),
  )) reasons.push('库位余额存在负数或可用数量不一致')
  return reasons
}
