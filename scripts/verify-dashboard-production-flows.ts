import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildProductionFlowDashboard } from '../lib/dashboard'
import { buildDashboardMetricItems, normalizeDashboard } from '../modules/workspace/model/dashboard-view'

const root = process.cwd()
const requiredFiles = [
  'modules/workspace/client/dashboard-api.ts',
  'modules/workspace/contracts/dashboard.ts',
  'modules/workspace/model/dashboard-view.ts',
  'modules/workspace/ui/DashboardPanels.tsx',
  'modules/workspace/ui/DashboardPage.tsx',
]
for (const path of requiredFiles) assert.ok(existsSync(join(root, path)), `工作台模块缺少文件：${path}`)
const pageSource = readFileSync(join(root, 'modules/workspace/ui/DashboardPage.tsx'), 'utf8')
const clientSource = readFileSync(join(root, 'modules/workspace/client/dashboard-api.ts'), 'utf8')
assert.ok(pageSource.split('\n').length <= 100, '工作台协调页应保持在 100 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '工作台页面不得直接调用 fetch')
assert.match(pageSource, /loadDashboard\(/, '工作台页面必须通过领域 client 读取统计')
assert.match(clientSource, /fetch\('\/api\/stats\/dashboard'/, '仪表盘接口必须集中在 workspace client')

const orderActualFlow = buildProductionFlowDashboard({
  todayOrderCount: 2,
  monthOrderCount: 9,
  todayProductionActualCount: 3,
  monthProductionActualCount: 12,
  todayProductionActualOutput: 7.125,
  monthProductionActualOutput: 35.875,
})

assert.equal(orderActualFlow.todayOrderCount, 2)
assert.equal(orderActualFlow.monthOrderCount, 9)
assert.equal(orderActualFlow.todayProductionActualCount, 3)
assert.equal(orderActualFlow.monthProductionActualCount, 12)
assert.equal(orderActualFlow.todayProduction, 7.125)
assert.equal(orderActualFlow.monthProduction, 35.875)

const orderWithoutActual = buildProductionFlowDashboard({
  todayOrderCount: 0,
  monthOrderCount: 0,
  todayProductionActualCount: 0,
  monthProductionActualCount: 0,
  todayProductionActualOutput: 0,
  monthProductionActualOutput: 0,
})

assert.equal(orderWithoutActual.todayProduction, 0)
assert.equal(orderWithoutActual.monthProduction, 0)

const normalized = normalizeDashboard({
  todayOrders: 4,
  monthOrders: 10,
  pendingMaterialIns: 2,
  pendingShipments: 3,
  pendingReturns: 1,
  alertStocks: [{ id: 'stock-1', availableQty: 2 }],
  orderStatusDist: [{ status: 'DRAFT', count: 4 }],
})
assert.equal(normalized.todayOrderCount, 4, '工作台必须兼容旧订单统计字段')
assert.equal(normalized.pendingMaterialInCount, 2, '工作台必须兼容旧待收货字段')
assert.equal(normalized.lowStocks.length, 1, '工作台必须兼容旧库存预警字段')
const metrics = buildDashboardMetricItems(normalized)
assert.equal(metrics.length, 8)
assert.equal(metrics.find((item) => item.label === '库存预警')?.value, 1)

console.log('工作台模块验证通过：页面零直接请求，统计兼容、指标装配和生产流数据符合预期。')
