import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const pagePath = 'modules/inventory/ui/StockPageModule.tsx'
const page = read(pagePath)
const client = read('modules/inventory/client/stock-api.ts')
const model = read('modules/inventory/model/stock-view.ts')
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

console.log(`库存模块验证通过：协调页 ${page.split('\n').length} 行，4 个稳定用户任务与领域客户端、契约、视图模型均已接入。`)
