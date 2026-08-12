export const STOCK_BALANCE_TOLERANCE = 0.000001

export interface StockLocationBalanceSnapshot {
  qty: number
  reservedQty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
}

export interface StockBalanceSnapshot {
  qty: number
  reservedQty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
  valuationQty: number
  reservedValuationQty: number
  availableValuationQty: number
  quarantineValuationQty: number
  holdValuationQty: number
  totalCost: number
  quarantineCost: number
  holdCost: number
  hasMaterial: boolean
  hasProduct: boolean
  materialExists: boolean
  productExists: boolean
  locationBalances: StockLocationBalanceSnapshot[]
}

const balanceFields = [
  'qty', 'reservedQty', 'availableQty', 'quarantineQty', 'holdQty', 'valuationQty',
  'reservedValuationQty', 'availableValuationQty', 'quarantineValuationQty', 'holdValuationQty',
  'totalCost', 'quarantineCost', 'holdCost',
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
  if (stock.qty < -STOCK_BALANCE_TOLERANCE || stock.reservedQty < -STOCK_BALANCE_TOLERANCE || stock.availableQty < -STOCK_BALANCE_TOLERANCE || stock.quarantineQty < -STOCK_BALANCE_TOLERANCE || stock.holdQty < -STOCK_BALANCE_TOLERANCE) reasons.push('库存数量不能为负数')
  if (stock.valuationQty < -STOCK_BALANCE_TOLERANCE || stock.reservedValuationQty < -STOCK_BALANCE_TOLERANCE || stock.availableValuationQty < -STOCK_BALANCE_TOLERANCE || stock.quarantineValuationQty < -STOCK_BALANCE_TOLERANCE || stock.holdValuationQty < -STOCK_BALANCE_TOLERANCE) reasons.push('核算库存不能为负数')
  if (stock.totalCost < -STOCK_BALANCE_TOLERANCE || stock.quarantineCost < -STOCK_BALANCE_TOLERANCE || stock.holdCost < -STOCK_BALANCE_TOLERANCE) reasons.push('库存金额不能为负数')
  if (stock.reservedQty - stock.qty > STOCK_BALANCE_TOLERANCE) reasons.push('预留库存不能大于库存')
  if (stock.reservedValuationQty - stock.valuationQty > STOCK_BALANCE_TOLERANCE) reasons.push('预留核算库存不能大于核算库存')
  if (!closeEnough(stock.availableQty, stock.qty - stock.reservedQty - stock.quarantineQty - stock.holdQty)) reasons.push('可用库存必须等于库存减预留、待检和冻结')
  if (!closeEnough(stock.availableValuationQty, stock.valuationQty - stock.reservedValuationQty - stock.quarantineValuationQty - stock.holdValuationQty)) reasons.push('可用核算库存必须等于核算库存减预留、待检和冻结核算库存')
  if (stock.quarantineCost + stock.holdCost - stock.totalCost > STOCK_BALANCE_TOLERANCE) reasons.push('待检和冻结成本不能大于总库存成本')

  const locationQty = stock.locationBalances.reduce((sum, item) => sum + item.qty, 0)
  const locationReservedQty = stock.locationBalances.reduce((sum, item) => sum + item.reservedQty, 0)
  const locationAvailableQty = stock.locationBalances.reduce((sum, item) => sum + item.availableQty, 0)
  const locationQuarantineQty = stock.locationBalances.reduce((sum, item) => sum + item.quarantineQty, 0)
  const locationHoldQty = stock.locationBalances.reduce((sum, item) => sum + item.holdQty, 0)
  if (!closeEnough(locationQty, stock.qty)) reasons.push('各库位库存合计必须等于物料总库存')
  if (!closeEnough(locationReservedQty, stock.reservedQty)) reasons.push('各库位占用合计必须等于物料总占用')
  if (!closeEnough(locationAvailableQty, stock.availableQty)) reasons.push('各库位可用合计必须等于物料总可用')
  if (!closeEnough(locationQuarantineQty, stock.quarantineQty)) reasons.push('各库位待检合计必须等于物料总待检')
  if (!closeEnough(locationHoldQty, stock.holdQty)) reasons.push('各库位冻结合计必须等于物料总冻结')
  if (stock.locationBalances.some((item) =>
    item.qty < -STOCK_BALANCE_TOLERANCE
    || item.reservedQty < -STOCK_BALANCE_TOLERANCE
    || item.quarantineQty < -STOCK_BALANCE_TOLERANCE
    || item.holdQty < -STOCK_BALANCE_TOLERANCE
    || !closeEnough(item.availableQty, item.qty - item.reservedQty - item.quarantineQty - item.holdQty),
  )) reasons.push('库位余额存在负数或状态数量不一致')
  return reasons
}
