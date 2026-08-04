import assert from 'node:assert/strict'
import {
  baseUnitByMeasure,
  convertUnitValue,
  findCatalogUnit,
  normalizeCustomUnit,
  normalizeUnitCode,
  presetUnitCatalog,
} from '../lib/unit-catalog'
import {
  bomStoredQuantityToEntry,
  convertBomEntryQuantity,
  defaultBomEntryUnit,
  normalizeBomEntryQuantity,
} from '../lib/bom-entry-units'

assert.equal(baseUnitByMeasure.LENGTH, 'm')
assert.equal(baseUnitByMeasure.WEIGHT, 'kg')
assert.equal(baseUnitByMeasure.QUANTITY, '件')
assert.equal(normalizeUnitCode(' MM '), 'mm')

const millimeter = findCatalogUnit(presetUnitCatalog, 'LENGTH', 'MM')
const meter = findCatalogUnit(presetUnitCatalog, 'LENGTH', 'm')
assert.ok(millimeter)
assert.ok(meter)
assert.equal(convertUnitValue(350, millimeter, meter), 0.35)

const gram = findCatalogUnit(presetUnitCatalog, 'WEIGHT', 'g')
const kilogram = findCatalogUnit(presetUnitCatalog, 'WEIGHT', 'kg')
assert.ok(gram)
assert.ok(kilogram)
assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'LENGTH', stockUnit: 'm' }), 'mm')
assert.equal(defaultBomEntryUnit(presetUnitCatalog, { primaryMeasure: 'WEIGHT', stockUnit: 'kg' }), 'g')
assert.deepEqual(normalizeBomEntryQuantity({
  quantity: 31.6,
  entryUnit: 'mm',
  material: { primaryMeasure: 'LENGTH', stockUnit: 'm' },
  catalog: presetUnitCatalog,
}), { quantity: 0.0316, unit: 'm', entryUnit: 'mm' })
assert.deepEqual(normalizeBomEntryQuantity({
  quantity: 250,
  entryUnit: 'g',
  material: { primaryMeasure: 'WEIGHT', stockUnit: 'kg' },
  catalog: presetUnitCatalog,
}), { quantity: 0.25, unit: 'kg', entryUnit: 'g' })
assert.equal(bomStoredQuantityToEntry({
  quantity: 0.0316,
  entryUnit: 'mm',
  material: { primaryMeasure: 'LENGTH', stockUnit: 'm' },
  catalog: presetUnitCatalog,
}), 31.6)
assert.equal(convertBomEntryQuantity(1, 'm', 'mm', { primaryMeasure: 'LENGTH', stockUnit: 'm' }, presetUnitCatalog), 1000)
assert.throws(() => normalizeBomEntryQuantity({
  quantity: 1,
  entryUnit: '根',
  material: { primaryMeasure: 'QUANTITY', stockUnit: '件' },
  catalog: presetUnitCatalog,
}), /必须使用主库存单位/)

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

console.log('单位目录预置、BOM 录入单位和基准换算验证通过')
