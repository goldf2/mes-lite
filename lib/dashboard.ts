export interface ProductionFlowDashboardInput {
  todayOrderCount: number
  monthOrderCount: number
  todayDailyReportCount: number
  monthDailyReportCount: number
  todayWorkReportProduction: number
  monthWorkReportProduction: number
  todayDailyReportProduction: number
  monthDailyReportProduction: number
}

const roundDashboardValue = (value: number) => Number(Number(value || 0).toFixed(6))

export function buildProductionFlowDashboard(input: ProductionFlowDashboardInput) {
  return {
    ...input,
    todayProductionRecordCount: input.todayOrderCount + input.todayDailyReportCount,
    monthProductionRecordCount: input.monthOrderCount + input.monthDailyReportCount,
    todayProduction: roundDashboardValue(
      input.todayWorkReportProduction + input.todayDailyReportProduction,
    ),
    monthProduction: roundDashboardValue(
      input.monthWorkReportProduction + input.monthDailyReportProduction,
    ),
  }
}
