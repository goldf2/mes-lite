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
const page = read('modules/bom/ui/BomCostPageModule.tsx')
const client = read('modules/bom/client/bom-cost-api.ts')
const publicEntry = read('modules/bom/index.ts')

assert.ok(route.split('\n').length <= 80, 'BOM 成本 API 必须保持为不超过 80 行的 HTTP 适配层')
assert.doesNotMatch(route, /prisma\.|findMany\(|\.create\(/, 'BOM 成本 API 不得直接查询或写入数据库')
assert.match(route, /listBomCostWorkspace\(/, 'BOM 成本 API 必须通过查询服务装配工作区')
assert.match(route, /createBomCostRun\(/, 'BOM 成本 API 必须通过命令服务保存快照')
assert.match(route, /writeAuditLog\(/, 'BOM 成本 API 必须保留请求级审计')
assert.match(commandService, /calculateBomCostSnapshot\(/, 'BOM 成本命令服务必须调用纯领域计算')
assert.match(commandService, /prisma\.bomCostRun\.create\(/, 'BOM 成本快照必须由命令服务写入')
assert.match(queryService, /materialAsProductOption\(/, 'BOM 成本查询服务必须统一装配物料产品选项')
assert.doesNotMatch(domain, /@prisma|prisma\.|fetch\(/, 'BOM 成本领域规则不得依赖 HTTP 或 Prisma')
assert.ok(page.split('\n').length <= 560, 'BOM 成本页面必须保持为不超过 560 行的协调层')
assert.doesNotMatch(page, /\bfetch\(/, 'BOM 成本页面不得直接发起 HTTP 请求')
assert.match(page, /from '\.\.\/client\/bom-cost-api'/, 'BOM 成本页面必须通过领域客户端访问 HTTP')
assert.match(client, /export async function loadBomCostWorkspace/, 'BOM 成本客户端必须提供工作区查询')
assert.match(client, /export async function calculateBomCost/, 'BOM 成本客户端必须提供快照计算命令')
assert.match(publicEntry, /BomCostPageModule/, 'BOM 模块公开出口必须保留成本页面模块')

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

const routeSnapshot = calculateBomCostSnapshot({
  productId: 'product-1', quantityBasis: 100, laborRatePerHour: 0, machineRatePerHour: 0, overheadCost: 0,
  outputQuantity: 1, productUnit: '件', processRouteName: '支架加工路线',
  processSteps: [{
    id: 'step-1', stepNo: 10, name: '锯切', templateCode: 'SAW-001',
    standardBatchQty: 100, setupTimeMinutes: 6, cycleTimeSeconds: 10,
    peopleCount: 1, laborRatePerHour: 20, machineCount: 1, machineRatePerHour: 30,
    energyCostPerHour: 5, consumableCostPerBatch: 10, yieldRate: 1,
    workCenter: { code: 'WC-SAW', name: '锯切中心' },
  }],
  items: [],
})
const operationLine = routeSnapshot.lines.find((line) => line.lineType === 'PROCESS_OPERATION')
assert.ok(operationLine, '工艺路线必须生成加工工序成本行')
assert.equal(operationLine?.code, 'SAW-001')
assert.equal(operationLine?.note, '支架加工路线 · 工作中心 WC-SAW 锯切中心')
assert.equal(routeSnapshot.totalCost, operationLine?.totalCost)
assert.ok(Number(operationLine?.laborCost) > 0 && Number(operationLine?.machineCost) > 0, '工序成本必须拆分人工和机时')

assert.throws(() => calculateBomCostSnapshot({
  productId: 'product-1', quantityBasis: 1, laborRatePerHour: 0, machineRatePerHour: 0, overheadCost: 0,
  outputQuantity: 1,
  items: [{ itemType: 'MATERIAL', quantity: 0, material }],
}), BomCostRuleError)

console.log(`BOM 成本模块验证通过：页面 ${page.split('\n').length} 行，API ${route.split('\n').length} 行，前后端与成本纯规则边界完整。`)
