import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSalesOrderDraftLine, money, numberText } from '../modules/sales/model/sales-order-view'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const requiredFiles = [
  'modules/sales/index.ts',
  'modules/sales/client/sales-order-api.ts',
  'modules/sales/contracts/sales-order.ts',
  'modules/sales/model/sales-order-view.ts',
  'modules/sales/ui/SalesOrderPageModule.tsx',
  'modules/sales/client/fulfillment-api.ts',
  'modules/sales/contracts/fulfillment.ts',
  'modules/sales/model/fulfillment-view.ts',
  'modules/sales/ui/ShipmentPageModule.tsx',
  'modules/sales/ui/ShipmentCreateDialog.tsx',
  'modules/sales/ui/ReturnPageModule.tsx',
]

for (const path of requiredFiles) {
  assert.ok(existsSync(join(root, path)), `销售领域缺少模块文件：${path}`)
}

const page = read('modules/sales/ui/SalesOrderPageModule.tsx')
const shipmentPage = read('modules/sales/ui/ShipmentPageModule.tsx')
const shipmentDialog = read('modules/sales/ui/ShipmentCreateDialog.tsx')
const returnPage = read('modules/sales/ui/ReturnPageModule.tsx')
const client = read('modules/sales/client/sales-order-api.ts')
const fulfillmentClient = read('modules/sales/client/fulfillment-api.ts')
const registry = read('app/components/shell/WorkspacePageRendererRegistry.tsx')
assert.ok(page.split('\n').length <= 620, '销售订单协调页应保持在 620 行内')
assert.doesNotMatch(page, /\bfetch\(/, '销售订单页不得直接调用 fetch')
assert.match(page, /loadSalesOrders\(/, '销售订单页必须通过领域 client 读取列表')
assert.match(page, /createSalesOrder\(/, '销售订单页必须通过领域 client 创建单据')
assert.match(client, /updateSalesOrderPrices/, '销售领域 client 必须封装调价请求')
assert.match(registry, /import\('@\/modules\/sales'\)/, '页面注册必须通过销售模块公开入口加载')
assert.ok(shipmentPage.split('\n').length <= 400, '发货单协调页应保持在 400 行内')
assert.ok(shipmentDialog.split('\n').length <= 400, '发货单创建对话框应保持在 400 行内')
assert.ok(returnPage.split('\n').length <= 560, '退货单协调页应保持在 560 行内')
assert.doesNotMatch(shipmentPage, /\bfetch\(/, '发货单页不得直接调用 fetch')
assert.doesNotMatch(shipmentDialog, /\bfetch\(/, '发货单创建对话框不得直接调用 fetch')
assert.doesNotMatch(returnPage, /\bfetch\(/, '退货单页不得直接调用 fetch')
assert.match(fulfillmentClient, /loadShipmentCreateOptions/, '销售履约 client 必须封装发货选项读取')
assert.match(fulfillmentClient, /transitionReturn/, '销售履约 client 必须封装退货状态变更')
assert.match(registry, /ShipmentPageModule/, '发货页必须通过销售模块公开入口加载')
assert.match(registry, /ReturnPageModule/, '退货页必须通过销售模块公开入口加载')

assert.equal(numberText(12.5), '12.5')
assert.equal(money(12.5), '¥12.50')
assert.equal(createSalesOrderDraftLine().qty, 0)

console.log(`销售模块验证通过：订单 ${page.split('\n').length} 行、发货 ${shipmentPage.split('\n').length} 行、退货 ${returnPage.split('\n').length} 行，页面、client、契约和视图规则边界完整。`)
