import assert from 'node:assert/strict'
import {
  baseUnitToBomInput,
  bomRatiosDiffer,
  bomInputToBaseUnit,
  calculateBomUnitRatio,
} from '../lib/bom-ratio'
import { isMeterUnit } from '../lib/units'

assert.equal(calculateBomUnitRatio({
  mode: 'STANDARD_USAGE',
  standardUsage: 350,
  inputToStockUnitRate: 0.001,
}), 0.35)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 20,
  rawMaterialQuantity: 7000,
  inputToStockUnitRate: 0.001,
}), 0.35)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 25,
  rawMaterialQuantity: 12.5,
  inputToStockUnitRate: 1,
}), 0.5)

assert.equal(calculateBomUnitRatio({
  mode: 'STANDARD_USAGE',
  standardUsage: 35,
  inputToStockUnitRate: 0.01,
}), 0.35)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 20,
  rawMaterialQuantity: 7,
  inputToStockUnitRate: 1,
}), 0.35)

assert.equal(bomInputToBaseUnit(352.5, 0.001), 0.3525)
assert.equal(baseUnitToBomInput(0.3525, 0.001), 352.5)
assert.equal(bomRatiosDiffer(1, 0.0336), true)
assert.equal(bomRatiosDiffer(0.0336, 0.0336000001), false)
assert.equal(isMeterUnit('m'), true)
assert.equal(isMeterUnit('米'), true)
assert.equal(isMeterUnit('mm'), false)

assert.equal(calculateBomUnitRatio({
  mode: 'STANDARD_USAGE',
  standardUsage: 0.001,
}), 0.001)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 1000,
  rawMaterialQuantity: 1,
}), 0.001)

assert.throws(() => calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 0,
  rawMaterialQuantity: 7000,
}), /产出总量/)

console.log('BOM 单位标准用量及长度/重量/数量批量换算统一为单位比例验证通过')
