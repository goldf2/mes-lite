import assert from 'node:assert/strict'
import { calculateProductionConsumption } from '../lib/production-consumption'

const percentageLoss = calculateProductionConsumption({
  outputQty: 100,
  unitConsumption: 0.35,
  lossMode: 'PERCENT',
  lossValue: 5,
})
assert.deepEqual(percentageLoss, {
  baseQty: 35,
  lossQty: 1.75,
  plannedQty: 36.75,
  actualQty: 36.75,
})

const fixedLoss = calculateProductionConsumption({
  outputQty: 100,
  unitConsumption: 0.35,
  lossMode: 'FIXED_PER_UNIT',
  lossValue: 0.01,
  actualQty: 36.2,
})
assert.deepEqual(fixedLoss, {
  baseQty: 35,
  lossQty: 1,
  plannedQty: 36,
  actualQty: 36.2,
})

assert.throws(() => calculateProductionConsumption({
  outputQty: 100,
  unitConsumption: 0,
  lossMode: 'PERCENT',
  lossValue: 0,
}), /单位消耗量/)

console.log('生产单位消耗量与损耗计算验证通过')
