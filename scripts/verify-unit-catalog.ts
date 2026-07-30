import assert from 'node:assert/strict'
import {
  baseUnitByMeasure,
  convertUnitValue,
  findCatalogUnit,
  normalizeCustomUnit,
  normalizeUnitCode,
  presetUnitCatalog,
} from '../lib/unit-catalog'

assert.equal(baseUnitByMeasure.LENGTH, 'm')
assert.equal(baseUnitByMeasure.WEIGHT, 'kg')
assert.equal(baseUnitByMeasure.QUANTITY, '件')
assert.equal(normalizeUnitCode(' MM '), 'mm')

const millimeter = findCatalogUnit(presetUnitCatalog, 'LENGTH', 'MM')
const meter = findCatalogUnit(presetUnitCatalog, 'LENGTH', 'm')
assert.ok(millimeter)
assert.ok(meter)
assert.equal(convertUnitValue(350, millimeter, meter), 0.35)

assert.deepEqual(normalizeCustomUnit({
  code: ' FT ',
  name: ' 英尺 ',
  measureType: 'LENGTH',
  toBaseFactor: 0.3048,
}), {
  code: 'ft',
  name: '英尺',
  measureType: 'LENGTH',
  toBaseFactor: 0.3048,
})

console.log('单位目录预置、归一化和基准换算验证通过')
