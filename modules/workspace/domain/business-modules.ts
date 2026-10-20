import type { WorkspaceFunctionKey } from '@/lib/workspace'

export type BusinessModuleKey =
  | 'production'
  | 'sales'
  | 'logistics'
  | 'inventory'
  | 'materials'
  | 'equipment'
  | 'customers'
  | 'service'
  | 'administration'

export interface BusinessModuleDefinition {
  key: BusinessModuleKey
  label: string
  description: string
  ownerApp: 'mes' | 'data-platform'
}

export const businessModuleDefinitions: readonly BusinessModuleDefinition[] = [
  { key: 'production', label: '生产管理', description: '生产订单、生产日报、质量任务和加工工艺', ownerApp: 'mes' },
  { key: 'sales', label: '销售管理', description: '销售订单和 MES 客户业务资料', ownerApp: 'mes' },
  { key: 'logistics', label: '收发管理', description: '供应商、来料、发货、退货和历史核查', ownerApp: 'mes' },
  { key: 'inventory', label: '库存管理', description: '库存、库位、盘点、流程转移、扫码和批次追溯', ownerApp: 'mes' },
  { key: 'materials', label: '物料管理', description: '物料、BOM、计量单位和产品文档', ownerApp: 'mes' },
  { key: 'equipment', label: '设备管理', description: '本厂生产设备、点检和维保', ownerApp: 'mes' },
  { key: 'customers', label: '客户管理', description: '数据平台的正式客户、联系人、地点和客户地图', ownerApp: 'data-platform' },
  { key: 'service', label: '客户服务', description: '客户设备、型号、安装记录和设备地图', ownerApp: 'data-platform' },
  { key: 'administration', label: '系统管理', description: '企业规则、人员权限、系统设置和管理工具', ownerApp: 'mes' },
]

const moduleFunctionKeys: Record<BusinessModuleKey, readonly WorkspaceFunctionKey[]> = {
  production: ['orders', 'dailyInventory', 'dispatch', 'taskCollaboration', 'qualityTasks', 'employees', 'workCenters', 'processTemplates', 'processRoutes', 'sawingCost'],
  sales: ['salesOrders', 'customers'],
  logistics: ['materialIn', 'materialInHistory', 'shipment', 'shipmentHistory', 'return', 'suppliers'],
  inventory: ['stocks', 'warehouseDigitalTwin', 'inventoryCount', 'stockMovements', 'lotPanorama', 'locationSettings', 'flowTransfers', 'scanPrint'],
  materials: ['materialManagement', 'bomWorkspace', 'bomUsage', 'workInstructions', 'documentCategories', 'unitSettings'],
  equipment: ['equipment', 'equipmentInspections', 'equipmentMaintenance'],
  customers: ['dataCustomers', 'dataContacts', 'dataSites', 'dataCustomerMap'],
  service: ['dataDevices', 'dataDeviceModels', 'dataInstallations', 'dataDeviceMap'],
  administration: ['helpCenter', 'businessSettings', 'displaySettings', 'navigationSettings', 'cadPreviewSettings', 'aiSettings', 'apiSettings', 'archive', 'auditLogs', 'dataTools', 'operators', 'permissionUsers', 'permissionGroups'],
}

const moduleByFunction = new Map<WorkspaceFunctionKey, BusinessModuleDefinition>(
  businessModuleDefinitions.flatMap((module) => moduleFunctionKeys[module.key].map((key) => [key, module] as const)),
)

/** Navigation ownership only; the destination still checks its own business permissions. */
export function getBusinessModuleForFunction(functionKey: WorkspaceFunctionKey) {
  return moduleByFunction.get(functionKey)
}

export function getAvailableBusinessModules<T extends { key: WorkspaceFunctionKey }>(items: readonly T[]) {
  return businessModuleDefinitions.flatMap((module) => {
    const moduleItems = items.filter((item) => moduleFunctionKeys[module.key].includes(item.key))
    return moduleItems.length > 0 ? [{ ...module, items: moduleItems }] : []
  })
}
