export interface DashboardStatusItem {
  status: string
  count: number
}

export interface DashboardStockAlert {
  id: string
  availableQty?: number
  material?: { name?: string; code?: string } | null
  product?: { name?: string; sku?: string } | null
}

export interface DashboardSalesDeliveryReference {
  customerId: string
  materialId: string
  customer: { code: string; name: string } | null
  material: { code: string; name: string } | null
  orderedQty: number
  pendingQty: number
  shippedQty: number
  remainingQty: number
  overQty: number
  unit: string
}

export interface DashboardData {
  todayOrderCount?: number
  todayOrders?: number
  monthOrderCount?: number
  monthOrders?: number
  todayProductionActualCount?: number
  monthProductionActualCount?: number
  todayProduction?: number
  monthProduction?: number
  pendingProductionActualCount?: number
  pendingMaterialInCount?: number
  pendingMaterialIns?: number
  pendingShipmentCount?: number
  pendingShipments?: number
  pendingReturnCount?: number
  pendingReturns?: number
  dueEquipmentInspectionCount?: number
  dueEquipmentMaintenanceCount?: number
  openEquipmentMaintenanceCount?: number
  lowStocks?: DashboardStockAlert[]
  alertStocks?: DashboardStockAlert[]
  statusDistribution?: DashboardStatusItem[]
  orderStatusDist?: DashboardStatusItem[]
  productionActualStatusDistribution?: DashboardStatusItem[]
  roleTaskSections?: import('../model/role-task-view').RoleTaskSection[]
  salesDeliveryReferences?: DashboardSalesDeliveryReference[]
}

export interface DashboardView {
  todayOrderCount: number
  monthOrderCount: number
  todayProductionActualCount: number
  monthProductionActualCount: number
  todayProduction: number
  monthProduction: number
  pendingProductionActualCount: number
  pendingMaterialInCount: number
  pendingShipmentCount: number
  pendingReturnCount: number
  lowStocks: DashboardStockAlert[]
  statusDistribution: DashboardStatusItem[]
  productionActualStatusDistribution: DashboardStatusItem[]
  roleTaskSections: import('../model/role-task-view').RoleTaskSection[]
  salesDeliveryReferences: DashboardSalesDeliveryReference[]
}

export interface DashboardMetricItem {
  label: string
  value: number
  tone: string
  hint: string
}
