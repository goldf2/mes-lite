import type { DashboardData, DashboardMetricItem, DashboardView } from '../contracts/dashboard'

export function normalizeDashboard(data: DashboardData): DashboardView {
  return {
    todayOrderCount: data.todayOrderCount ?? data.todayOrders ?? 0,
    monthOrderCount: data.monthOrderCount ?? data.monthOrders ?? 0,
    todayProductionActualCount: data.todayProductionActualCount ?? 0,
    monthProductionActualCount: data.monthProductionActualCount ?? 0,
    todayProduction: data.todayProduction ?? 0,
    monthProduction: data.monthProduction ?? 0,
    pendingProductionActualCount: data.pendingProductionActualCount ?? 0,
    pendingMaterialInCount: data.pendingMaterialInCount ?? data.pendingMaterialIns ?? 0,
    pendingShipmentCount: data.pendingShipmentCount ?? data.pendingShipments ?? 0,
    pendingReturnCount: data.pendingReturnCount ?? data.pendingReturns ?? 0,
    lowStocks: data.lowStocks ?? data.alertStocks ?? [],
    statusDistribution: data.statusDistribution ?? data.orderStatusDist ?? [],
    productionActualStatusDistribution: data.productionActualStatusDistribution ?? [],
    roleTaskSections: data.roleTaskSections ?? [],
  }
}

function numberText(value: number) {
  return Number(value || 0).toFixed(3).replace(/\.?0+$/, '') || '0'
}

export function buildDashboardMetricItems(view: DashboardView): DashboardMetricItem[] {
  return [
    { label: '今日生产订单', value: view.todayOrderCount, tone: 'blue', hint: `班后实绩 ${view.todayProductionActualCount}` },
    { label: '本月生产订单', value: view.monthOrderCount, tone: 'indigo', hint: `班后实绩 ${view.monthProductionActualCount}` },
    { label: '今日确认产量', value: view.todayProduction, tone: 'green', hint: `主产出 ${numberText(view.todayProduction)}` },
    { label: '本月确认产量', value: view.monthProduction, tone: 'emerald', hint: `主产出 ${numberText(view.monthProduction)}` },
    { label: '待收货', value: view.pendingMaterialInCount, tone: 'yellow', hint: '来料' },
    { label: '待发货', value: view.pendingShipmentCount, tone: 'orange', hint: '出库' },
    { label: '退货待处理', value: view.pendingReturnCount, tone: 'red', hint: '售后' },
    { label: '库存预警', value: view.lowStocks.length, tone: 'pink', hint: '低库存' },
  ]
}

export function buildDashboardWorkloadItems(view: DashboardView) {
  return [
    { label: '今日订单', value: view.todayOrderCount, tone: 'blue' },
    { label: '今日实绩', value: view.todayProductionActualCount, tone: 'indigo' },
    { label: '本月订单', value: view.monthOrderCount, tone: 'blue' },
    { label: '本月实绩', value: view.monthProductionActualCount, tone: 'indigo' },
    { label: '今日主产出', value: view.todayProduction, tone: 'green' },
    { label: '本月主产出', value: view.monthProduction, tone: 'emerald' },
  ]
}

export function buildDashboardPendingItems(view: DashboardView): DashboardMetricItem[] {
  return [
    { label: '生产实绩待确认', value: view.pendingProductionActualCount, tone: 'indigo', hint: '班后实绩草稿' },
    { label: '待收货', value: view.pendingMaterialInCount, tone: 'yellow', hint: '原材料入库' },
    { label: '待发货', value: view.pendingShipmentCount, tone: 'orange', hint: '成品出库' },
    { label: '退货待处理', value: view.pendingReturnCount, tone: 'red', hint: '售后返库' },
    { label: '库存预警', value: view.lowStocks.length, tone: 'pink', hint: '低于阈值' },
  ]
}
