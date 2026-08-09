export interface ProductionFlowDashboardInput {
  todayOrderCount: number
  monthOrderCount: number
  todayProductionActualCount: number
  monthProductionActualCount: number
  todayProductionActualOutput: number
  monthProductionActualOutput: number
}

const roundDashboardValue = (value: number) => Number(Number(value || 0).toFixed(6))

export function buildProductionFlowDashboard(input: ProductionFlowDashboardInput) {
  return {
    ...input,
    todayProduction: roundDashboardValue(input.todayProductionActualOutput),
    monthProduction: roundDashboardValue(input.monthProductionActualOutput),
  }
}
