import assert from 'node:assert/strict'
import {
  baseUnitToBomInput,
  bomRatiosDiffer,
  bomInputToBaseUnit,
  calculateBomUnitRatio,
} from '../lib/bom-ratio'
import { isMeterUnit } from '../lib/units'

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 350,
  lossMode: 'PERCENT',
  lossValue: 5,
  inputToStockUnitRate: 0.001,
}), 0.3675)

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 350,
  lossMode: 'FIXED',
  lossValue: 2.5,
  inputToStockUnitRate: 0.001,
}), 0.3525)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 20,
  rawMaterialQuantity: 7000,
  inputToStockUnitRate: 0.001,
}), 0.35)

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 35,
  lossMode: 'FIXED',
  lossValue: 0.25,
  inputToStockUnitRate: 0.01,
}), 0.3525)

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
  mode: 'USAGE_LOSS',
  standardUsage: 0.001,
  lossMode: 'PERCENT',
  lossValue: 0,
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
}), /成品数量/)

console.log('BOM 两种录入算法归一为单位换算比例验证通过')
