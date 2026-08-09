import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BomCostRuleError, calculateBomCostSnapshot, materialUnitCost } from '../modules/bom/domain/bom-cost'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const route = read('app/api/bom-costs/route.ts')
const commandService = read('modules/bom/server/bom-cost-command-service.ts')
const queryService = read('modules/bom/server/bom-cost-query-service.ts')
const domain = read('modules/bom/domain/bom-cost.ts')

assert.ok(route.split('\n').length <= 80, 'BOM 成本 API 必须保持为不超过 80 行的 HTTP 适配层')
assert.doesNotMatch(route, /prisma\.|findMany\(|\.create\(/, 'BOM 成本 API 不得直接查询或写入数据库')
assert.match(route, /listBomCostWorkspace\(/, 'BOM 成本 API 必须通过查询服务装配工作区')
assert.match(route, /createBomCostRun\(/, 'BOM 成本 API 必须通过命令服务保存快照')
assert.match(route, /writeAuditLog\(/, 'BOM 成本 API 必须保留请求级审计')
assert.match(commandService, /calculateBomCostSnapshot\(/, 'BOM 成本命令服务必须调用纯领域计算')
assert.match(commandService, /prisma\.bomCostRun\.create\(/, 'BOM 成本快照必须由命令服务写入')
assert.match(queryService, /materialAsProductOption\(/, 'BOM 成本查询服务必须统一装配物料产品选项')
assert.doesNotMatch(domain, /@prisma|prisma\.|fetch\(/, 'BOM 成本领域规则不得依赖 HTTP 或 Prisma')

const material = {
  id: 'material-1', code: 'MAT-1', name: '铝材', stockUnit: 'kg', unit: 'kg',
  valuationUnit: 'm', stock: { stockUnitCost: 5, valuationUnitCost: 8 },
}
assert.equal(materialUnitCost({ itemType: 'MATERIAL', quantity: 1, unit: 'm', material }), 8)
assert.equal(materialUnitCost({ itemType: 'MATERIAL', quantity: 1, unit: 'kg', material }), 5)

const snapshot = calculateBomCostSnapshot({
  productId: 'product-1', quantityBasis: 100, laborRatePerHour: 20, machineRatePerHour: 30, overheadCost: 50,
  outputQuantity: 10, productUnit: '件', primaryOutputMaterialId: 'output-1',
  items: [
    { itemType: 'MATERIAL', quantity: 2, unit: 'kg', wastageRate: 10, material },
    {
      itemType: 'COST_OBJECT', quantity: 1, unit: '件',
      costObject: {
        id: 'cost-1', code: 'PROCESS', name: '加工', objectType: 'PROCESS',
        costs: [{ materialCostPerUnit: 2, laborHoursPerUnit: 0.5, machineHoursPerUnit: 0.2, directCostPerUnit: 1 }],
      },
    },
  ],
})
assert.equal(snapshot.lines.length, 3)
assert.equal(snapshot.totalMaterialCost, 130)
assert.equal(snapshot.totalLaborCost, 100)
assert.equal(snapshot.totalMachineCost, 60)
assert.equal(snapshot.totalDirectCost, 10)
assert.equal(snapshot.totalCost, 350)
assert.equal(snapshot.unitCost, 3.5)

assert.throws(() => calculateBomCostSnapshot({
  productId: 'product-1', quantityBasis: 1, laborRatePerHour: 0, machineRatePerHour: 0, overheadCost: 0,
  outputQuantity: 1,
  items: [{ itemType: 'MATERIAL', quantity: 0, material }],
}), BomCostRuleError)

console.log(`BOM 成本模块验证通过：API ${route.split('\n').length} 行，查询、快照事务与成本纯规则边界完整。`)
