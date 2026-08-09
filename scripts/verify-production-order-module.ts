import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildProductionOrderCreateInput, groupProductionOrders } from '../modules/production/model/production-order-view'

const root = process.cwd()
const requiredFiles = [
  'modules/production/client/production-order-api.ts',
  'modules/production/contracts/production-order.ts',
  'modules/production/model/production-order-view.ts',
  'modules/production/ui/ProductionOrderModule.tsx',
]
for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `生产订单模块缺少文件：${path}`)

const pageSource = readFileSync(join(root, 'modules/production/ui/ProductionOrderModule.tsx'), 'utf8')
const clientSource = readFileSync(join(root, 'modules/production/client/production-order-api.ts'), 'utf8')
const indexSource = readFileSync(join(root, 'modules/production/index.ts'), 'utf8')
assert.ok(pageSource.split('\n').length <= 480, '生产订单协调页应保持在 480 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '生产订单页面不得直接调用 fetch')
assert.match(pageSource, /loadProductionOrders\(/, '生产订单页面必须通过领域 client 读取列表')
assert.match(pageSource, /createProductionOrders\(/, '生产订单页面必须通过领域 client 创建订单')
assert.match(clientSource, /\/api\/orders\/options/, '生产订单 client 必须集中候选项接口')
assert.match(clientSource, /\/api\/orders\/\$\{encodeURIComponent\(orderId\)\}/, '生产订单 client 必须集中详情接口')
assert.match(indexSource, /ProductionOrderMode.*contracts\/production-order/, '生产订单模式类型必须从领域契约公开')

const orders = [
  { id: 'line-2', orderNo: 'WO-1-02', groupNo: 'WO-1', lineNo: 2, status: 'DRAFT', planQty: 2, completeQty: 0, scrapQty: 0, createdAt: '', product: { id: 'p2', name: 'B', sku: 'B' }, _count: { actuals: 0 } },
  { id: 'line-1', orderNo: 'WO-1', groupNo: 'WO-1', lineNo: 1, status: 'DRAFT', planQty: 1, completeQty: 0, scrapQty: 0, createdAt: '', product: { id: 'p1', name: 'A', sku: 'A' }, _count: { actuals: 0 } },
]
const grouped = groupProductionOrders(orders)
assert.equal(grouped.length, 1)
assert.deepEqual(grouped[0].lines.map((line) => line.id), ['line-1', 'line-2'], '同组订单必须按行号稳定排序')
assert.deepEqual(buildProductionOrderCreateInput([
  { id: 'draft', targetId: 'material-1', bomId: 'bom-1', planQty: 10 },
], 'PO-001', '加急'), {
  items: [{ targetId: 'material-1', bomId: 'bom-1', planQty: 10 }],
  voucherNo: 'PO-001',
  note: '加急',
})

console.log('生产订单前端模块验证通过：页面零直接请求，契约、client、分组和创建输入规则符合预期。')
