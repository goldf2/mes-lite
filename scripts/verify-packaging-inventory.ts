import assert from 'node:assert/strict'
import { buildPackagingInventoryAnalysis, type PackagingBomRelation, type PackagingStockBalance } from '../lib/packaging-inventory'

const piece = { id: 'piece-08', code: '08', name: '08号件', category: 'FINISHED', stockUnit: '件' }
const carton = { id: 'carton-08', code: 'BOX-08', name: '08号纸箱', category: 'PACKAGING', stockUnit: '个' }
const packed = { id: 'packed-08', code: '08-BOX-400', name: '08号件整箱', category: 'FINISHED', stockUnit: '箱' }

const relations: PackagingBomRelation[] = [{
  id: 'bom-pack-08',
  name: '08号件400件装',
  version: 'v1',
  output: { quantity: 1, material: packed },
  items: [
    { quantity: 400, material: piece },
    { quantity: 1, material: carton },
  ],
}]

const stocks: PackagingStockBalance[] = [{
  stockId: 'stock-packed-08',
  material: packed,
  qty: 39,
  locations: [
    { locationId: 'finished-a', code: 'FIN-A', name: '箱装成品库', qty: 30 },
    { locationId: 'shipping', code: 'SHIP', name: '发货区', qty: 9 },
  ],
}]

const analysis = buildPackagingInventoryAnalysis(relations, stocks)
const definition = analysis.definitions.get(packed.id)
assert.ok(definition)
assert.equal(definition.outputQuantity, 1)
assert.deepEqual(definition.contents.map((item) => [item.material.id, item.quantity]), [[piece.id, 400]])

const summary = analysis.summaries.get(piece.id)
assert.ok(summary)
assert.equal(summary.packagedEquivalentQty, 15600)
assert.equal(summary.sources.length, 1)
assert.deepEqual(summary.sources[0].locations.map((item) => [item.code, item.qty, item.equivalentQty]), [
  ['FIN-A', 30, 12000],
  ['SHIP', 9, 3600],
])
assert.equal(analysis.summaries.has(carton.id), false)
assert.equal(analysis.summaries.has(packed.id), false)

console.log('包装 BOM 定义、包装物排除、库存穿透和库位等效汇总验证通过')
