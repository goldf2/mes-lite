import assert from 'node:assert/strict'
import {
  bomLengthInputToMeters,
  calculateBomUnitRatio,
  metersToBomLengthInput,
} from '../lib/bom-ratio'
import { isMeterUnit } from '../lib/units'

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 350,
  lossMode: 'PERCENT',
  lossValue: 5,
  inputToStockUnitRate: bomLengthInputToMeters(1, 'mm'),
}), 0.3675)

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 350,
  lossMode: 'FIXED',
  lossValue: 2.5,
  inputToStockUnitRate: bomLengthInputToMeters(1, 'mm'),
}), 0.3525)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 20,
  rawMaterialQuantity: 7000,
  inputToStockUnitRate: bomLengthInputToMeters(1, 'mm'),
}), 0.35)

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 35,
  lossMode: 'FIXED',
  lossValue: 0.25,
  inputToStockUnitRate: bomLengthInputToMeters(1, 'cm'),
}), 0.3525)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 20,
  rawMaterialQuantity: 7,
  inputToStockUnitRate: bomLengthInputToMeters(1, 'm'),
}), 0.35)

assert.equal(metersToBomLengthInput(0.3525, 'mm'), 352.5)
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
