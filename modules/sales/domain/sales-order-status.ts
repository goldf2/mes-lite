export function salesOrderFulfillmentStatus(items: Array<{ qty: number; shippedQty: number }>) {
  const shippedQty = items.reduce((sum, item) => sum + Number(item.shippedQty), 0)
  const completed = items.length > 0
    && items.every((item) => Number(item.shippedQty) >= Number(item.qty) - 0.000001)
  return completed ? 'COMPLETED' : shippedQty > 0 ? 'PARTIAL' : 'CONFIRMED'
}
