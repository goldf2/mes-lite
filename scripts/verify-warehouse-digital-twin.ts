import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InventoryLocationOption, Stock } from '../modules/inventory/contracts/stock'
import {
  buildWarehouseDigitalTwin,
  warehouseTwinLocationMatches,
} from '../modules/inventory/model/warehouse-digital-twin'

const locations: InventoryLocationOption[] = [
  { id: 'default', code: 'DEFAULT', name: '默认仓位', isDefault: true, isActive: true },
  { id: 'quality', code: 'QC-01', name: '待检区', isActive: true },
  { id: 'inactive', code: 'OLD-01', name: '停用库位', isActive: false },
]

const stock = ({
  id,
  code,
  name,
  unit,
  locationId,
  qty,
  availableQty = 0,
  quarantineQty = 0,
  holdQty = 0,
}: {
  id: string
  code: string
  name: string
  unit: string
  locationId: string
  qty: number
  availableQty?: number
  quarantineQty?: number
  holdQty?: number
}): Stock => ({
  id,
  qty,
  reservedQty: 0,
  availableQty,
  quarantineQty,
  holdQty,
  reworkQty: 0,
  valuationQty: qty,
  reservedValuationQty: 0,
  availableValuationQty: availableQty,
  quarantineValuationQty: quarantineQty,
  holdValuationQty: holdQty,
  reworkValuationQty: 0,
  totalCost: 0,
  quarantineCost: 0,
  holdCost: 0,
  reworkCost: 0,
  valuationUnitCost: 0,
  stockUnitCost: 0,
  locationBalances: [{
    id: `${id}-${locationId}`,
    locationId,
    qty,
    reservedQty: 0,
    availableQty,
    quarantineQty,
    holdQty,
    reworkQty: 0,
    location: locations.find((location) => location.id === locationId) || locations[0],
  }],
  material: {
    id: `material-${id}`,
    code,
    name,
    spec: '测试规格',
    unit,
    stockUnit: unit,
    valuationUnit: unit,
    conversionRate: 1,
  },
  product: null,
})

const twin = buildWarehouseDigitalTwin([
  stock({ id: 'aluminium', code: 'AL-001', name: '铝型材', unit: 'kg', locationId: 'default', qty: 120, availableQty: 120 }),
  stock({ id: 'bracket', code: 'BR-001', name: '管柱挂钩支架', unit: '件', locationId: 'default', qty: 80, holdQty: 80 }),
  stock({ id: 'incoming', code: 'IN-001', name: '来料样件', unit: '件', locationId: 'quality', qty: 12, quarantineQty: 12 }),
], locations)

assert.equal(twin.locations.length, 2, '停用库位不得进入数字孪生白板')
assert.equal(twin.occupiedLocationCount, 2)
assert.equal(twin.materialLineCount, 3, '不同物料和不同单位必须保留独立数量行')
assert.equal(twin.statusLocationCounts.HOLD, 1, '冻结数量应使库位显示冻结风险')
assert.equal(twin.statusLocationCounts.QUARANTINE, 1, '待检数量应使库位显示待检状态')
assert.equal(twin.locations.find((location) => location.id === 'default')?.materials[0]?.unit, 'kg')
assert.equal(twin.locations.find((location) => location.id === 'default')?.materials[1]?.unit, '件')
assert.equal(warehouseTwinLocationMatches(twin.locations[0], '铝型材'), true)
assert.equal(warehouseTwinLocationMatches(twin.locations[1], 'DEFAULT'), false)

const root = process.cwd()
const clientSource = readFileSync(join(root, 'modules/inventory/client/warehouse-digital-twin-api.ts'), 'utf8')
const pageSource = readFileSync(join(root, 'modules/inventory/ui/WarehouseDigitalTwinPageModule.tsx'), 'utf8')
const registrySource = readFileSync(join(root, 'lib/page-registry.ts'), 'utf8')
const rendererSource = readFileSync(join(root, 'app/components/shell/WorkspacePageRendererRegistry.tsx'), 'utf8')
assert.match(clientSource, /loadStocks/)
assert.match(clientSource, /loadInventoryLocations/)
assert.doesNotMatch(clientSource, /fetch\(/, '数字孪生 client 不得绕过库存访问层直接请求')
assert.doesNotMatch(pageSource, /fetch\(/, '数字孪生页面不得直接请求接口')
assert.doesNotMatch(pageSource, /prisma/, '数字孪生页面不得直接访问数据库')
assert.match(registrySource, /key: 'warehouseDigitalTwin'/)
assert.match(rendererSource, /'warehouse-digital-twin'/)

console.log('仓库数字孪生 MVP 验证通过：复用授权库存事实、保留单位、状态着色、搜索和统一页面入口。')
