import assert from 'node:assert/strict'
import { buildProductionFlowDashboard } from '../lib/dashboard'

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

console.log('仪表盘生产订单与班后实绩统计验证通过')
