import assert from 'node:assert/strict'
import { calculateBomUnitRatio } from '../lib/bom-ratio'

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 350,
  lossMode: 'PERCENT',
  lossValue: 5,
}), 367.5)

assert.equal(calculateBomUnitRatio({
  mode: 'USAGE_LOSS',
  standardUsage: 350,
  lossMode: 'FIXED',
  lossValue: 2.5,
}), 352.5)

assert.equal(calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 20,
  rawMaterialQuantity: 7000,
}), 350)

assert.throws(() => calculateBomUnitRatio({
  mode: 'DIRECT_RATIO',
  outputQuantity: 0,
  rawMaterialQuantity: 7000,
}), /成品数量/)

console.log('BOM 两种录入算法归一为单位换算比例验证通过')
