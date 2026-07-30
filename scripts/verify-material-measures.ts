import assert from 'node:assert/strict'
import { resolveMaterialInStockQuantity } from '../lib/material-in-quantity'
import { resolveReceiptQuantities } from '../lib/inventory'

const totalLength = resolveMaterialInStockQuantity({
  primaryMeasure: 'LENGTH',
  qty: 107.6,
  pieceCount: 18,
  stockQtyMode: 'TOTAL',
  stockQtyInput: 107.6,
})
assert.equal(totalLength.qty, 107.6)
assert.equal(totalLength.pieceCount, 18)
assert.throws(
  () => resolveMaterialInStockQuantity({
    primaryMeasure: 'LENGTH',
    qty: 107.6,
    stockQtyMode: 'TOTAL',
    stockQtyInput: 107.6,
  }),
  /根数必须为正整数/,
)

const sameLength = resolveMaterialInStockQuantity({
  primaryMeasure: 'LENGTH',
  qty: 0,
  pieceCount: 18,
  stockQtyMode: 'PER_PIECE',
  stockQtyInput: 5.98,
})
assert.equal(sameLength.qty, 107.64)

const receipt = resolveReceiptQuantities({
  stockQty: totalLength.qty,
  valuationQty: 58.2,
  defaultConversionRate: 1,
  conversionSource: 'DOCUMENT_ACTUAL',
})
assert.equal(receipt.stockQty, 107.6)
assert.equal(receipt.valuationQty, 58.2)
assert.equal(receipt.conversionRateUsed, 0.540892)
assert.equal(receipt.conversionSource, 'DOCUMENT_ACTUAL')

const quantity = resolveMaterialInStockQuantity({
  primaryMeasure: 'QUANTITY',
  qty: 1000,
  pieceCount: 2,
  stockQtyMode: 'PER_PIECE',
  stockQtyInput: 500,
})
assert.equal(quantity.qty, 1000)
assert.equal(quantity.pieceCount, null)

console.log('物料主计量与长度型来料计算验证通过')
