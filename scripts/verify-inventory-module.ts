import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateStockBalance } from '../modules/inventory/domain/stock-integrity'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const pagePath = 'modules/inventory/ui/StockPageModule.tsx'
const page = read(pagePath)
const client = read('modules/inventory/client/stock-api.ts')
const model = read('modules/inventory/model/stock-view.ts')
const route = read('app/api/stocks/route.ts')
const queryService = read('modules/inventory/server/stock-query-service.ts')
const integrityService = read('modules/inventory/server/stock-integrity-service.ts')
const commandService = read('modules/inventory/server/stock-command-service.ts')
const requiredTasks = [
  'modules/inventory/ui/StockCollectionView.tsx',
  'modules/inventory/ui/StockDetailPanel.tsx',
  'modules/inventory/ui/StockAdjustmentDialog.tsx',
  'modules/inventory/ui/StockIntegrityAlert.tsx',
]

for (const path of requiredTasks) assert.ok(existsSync(join(root, path)), `库存领域缺少稳定用户任务：${path}`)
assert.ok(page.split('\n').length <= 350, 'StockPageModule 必须保持为不超过 350 行的薄协调层')
assert.doesNotMatch(page, /\bfetch\(/, '库存协调页不得直接发起 HTTP 请求')
assert.match(page, /from '\.\.\/client\/stock-api'/, '库存协调页必须通过领域客户端访问 HTTP')
assert.match(page, /<StockCollectionView/, '库存协调页必须编排集合视图')
assert.match(page, /<StockDetailPanel/, '库存协调页必须编排详情任务')
assert.match(page, /<StockAdjustmentDialog/, '库存协调页必须编排库存调整任务')
assert.match(client, /export async function loadStocks/, '库存客户端必须拥有列表查询')
assert.match(client, /export async function submitStockAdjustment/, '库存客户端必须拥有调整提交')
assert.match(model, /export function adjustedTotalQuantity/, '库存视图模型必须拥有调整后总量计算')
assert.doesNotMatch(model, /\bfetch\(|@prisma\/client/, '库存纯视图模型不得依赖 HTTP 或 Prisma')
assert.ok(route.split('\n').length <= 100, '库存 API 必须保持为不超过 100 行的 HTTP 适配层')
assert.doesNotMatch(route, /prisma\.|buildPackagingInventoryAnalysis|findMany\(/, '库存 API 不得直接执行查询、事务或包装库存计算')
assert.match(route, /listStocks\(/, '库存 API 必须通过查询服务读取库存')
assert.match(route, /repairStockRecords\(/, '库存 API 必须通过命令服务修复库存')
assert.match(route, /adjustStock\(/, '库存 API 必须通过命令服务调整库存')
assert.match(queryService, /findStockIntegrityIssues\(/, '库存查询必须先执行一致性检查')
assert.match(queryService, /buildPackagingInventoryAnalysis\(/, '库存查询服务必须拥有包装库存装配')
assert.match(integrityService, /validateStockBalance\(/, '库存一致性服务必须调用纯领域规则')
assert.match(commandService, /postStockLocationAdjustment\(/, '库存命令服务必须调用原子调整规则')

const validReasons = validateStockBalance({
  qty: 10, reservedQty: 3, availableQty: 5, quarantineQty: 1, holdQty: 1,
  valuationQty: 20, reservedValuationQty: 4, availableValuationQty: 12, quarantineValuationQty: 2, holdValuationQty: 2,
  totalCost: 100, quarantineCost: 10, holdCost: 10, hasMaterial: true, hasProduct: false,
  materialExists: true, productExists: false,
  locationBalances: [{ qty: 10, reservedQty: 3, availableQty: 5, quarantineQty: 1, holdQty: 1 }],
})
assert.deepEqual(validReasons, [], '平衡库存不得产生一致性错误')
const invalidReasons = validateStockBalance({
  qty: 5, reservedQty: 6, availableQty: 1, quarantineQty: 0, holdQty: 0,
  valuationQty: 5, reservedValuationQty: 0, availableValuationQty: 5, quarantineValuationQty: 0, holdValuationQty: 0,
  totalCost: 0, quarantineCost: 0, holdCost: 0, hasMaterial: true, hasProduct: true,
  materialExists: true, productExists: true,
  locationBalances: [{ qty: 4, reservedQty: 0, availableQty: 4, quarantineQty: 0, holdQty: 0 }],
})
assert.ok(invalidReasons.includes('库存记录必须且只能关联一个物料或内部兼容物料'))
assert.ok(invalidReasons.includes('预留库存不能大于库存'))
assert.ok(invalidReasons.includes('各库位库存合计必须等于物料总库存'))

console.log(`库存模块验证通过：协调页 ${page.split('\n').length} 行，API ${route.split('\n').length} 行，4 个用户任务及查询、命令、一致性领域规则均已接入。`)
