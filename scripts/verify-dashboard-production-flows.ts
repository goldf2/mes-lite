import assert from 'node:assert/strict'
import { buildProductionFlowDashboard } from '../lib/dashboard'

const mixedFlow = buildProductionFlowDashboard({
  todayOrderCount: 2,
  monthOrderCount: 9,
  todayDailyReportCount: 3,
  monthDailyReportCount: 12,
  todayWorkReportProduction: 20,
  monthWorkReportProduction: 80,
  todayDailyReportProduction: 7.125,
  monthDailyReportProduction: 35.875,
})

assert.equal(mixedFlow.todayProductionRecordCount, 5)
assert.equal(mixedFlow.monthProductionRecordCount, 21)
assert.equal(mixedFlow.todayProduction, 27.125)
assert.equal(mixedFlow.monthProduction, 115.875)

const reportOnly = buildProductionFlowDashboard({
  todayOrderCount: 0,
  monthOrderCount: 0,
  todayDailyReportCount: 2,
  monthDailyReportCount: 6,
  todayWorkReportProduction: 0,
  monthWorkReportProduction: 0,
  todayDailyReportProduction: 4.5,
  monthDailyReportProduction: 18.25,
})

assert.equal(reportOnly.todayProductionRecordCount, 2)
assert.equal(reportOnly.todayProduction, 4.5)

console.log('仪表盘工单流与生产日报流兼容统计验证通过')
