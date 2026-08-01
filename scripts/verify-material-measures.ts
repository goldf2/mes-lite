import assert from 'node:assert/strict'
import { resolveMaterialInPricing, resolveMaterialInStockQuantity } from '../lib/material-in-quantity'
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
assert.equal(totalLength.totalLength, 107.6)
assert.equal(totalLength.totalWeight, null)
assert.throws(
  () => resolveMaterialInStockQuantity({
    primaryMeasure: 'LENGTH',
    qty: 107.6,
    stockQtyMode: 'TOTAL',
    stockQtyInput: 107.6,
  }),
  /数量必须为正整数/,
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
  pieceCount: 1000,
})
assert.equal(quantity.qty, 1000)
assert.equal(quantity.pieceCount, 1000)

const measured = resolveMaterialInStockQuantity({
  primaryMeasure: 'LENGTH',
  qty: 0,
  pieceCount: 3,
  stockQtyMode: 'PER_PIECE',
  stockQtyInput: 4.39,
  totalWeight: 12.6,
})
assert.equal(measured.qty, 13.17)
assert.equal(measured.totalLength, 13.17)
assert.equal(measured.totalWeight, 12.6)

const priceByMeter = resolveMaterialInPricing({
  priceUnit: 'm',
  unitPrice: 20,
  totalLength: measured.totalLength,
  totalWeight: measured.totalWeight,
  pieceCount: measured.pieceCount,
})
assert.equal(priceByMeter.totalAmount, 263.4)
assert.equal(priceByMeter.unitPrice, 20)

const priceByWeight = resolveMaterialInPricing({
  priceUnit: 'kg',
  unitPrice: 0,
  totalAmount: 315,
  totalLength: measured.totalLength,
  totalWeight: measured.totalWeight,
  pieceCount: measured.pieceCount,
})
assert.equal(priceByWeight.unitPrice, 25)
assert.equal(priceByWeight.totalAmount, 315)

const priceByPiece = resolveMaterialInPricing({
  priceUnit: '件',
  unitPrice: 105,
  totalLength: measured.totalLength,
  totalWeight: measured.totalWeight,
  pieceCount: measured.pieceCount,
})
assert.equal(priceByPiece.totalAmount, 315)
assert.throws(
  () => resolveMaterialInPricing({ priceUnit: 'kg', unitPrice: 10, totalWeight: 0 }),
  /必须填写对应的长度、重量或数量/,
)

console.log('物料主计量、来料实测与计价计算验证通过')
