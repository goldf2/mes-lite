export const productionDataScopeModes = ['ALL', 'SELF', 'WORK_CENTERS'] as const
export const inventoryDataScopeModes = ['ALL', 'LOCATIONS'] as const

export type ProductionDataScopeMode = (typeof productionDataScopeModes)[number]
export type InventoryDataScopeMode = (typeof inventoryDataScopeModes)[number]

export interface EffectiveDataScope {
  operatorId: string
  employeeId: string | null
  employeeCode: string | null
  productionMode: ProductionDataScopeMode
  inventoryMode: InventoryDataScopeMode
  workCenterIds: string[]
  locationIds: string[]
  inheritedLegacyDefault: boolean
}

export interface DataScopeActor {
  id: string
  role: string
}

export const unrestrictedDataScope: EffectiveDataScope = {
  operatorId: '__SYSTEM__', employeeId: null, employeeCode: null,
  productionMode: 'ALL', inventoryMode: 'ALL',
  workCenterIds: [], locationIds: [], inheritedLegacyDefault: false,
}

export class DataScopeError extends Error {
  constructor(message = '无权访问当前数据范围', public readonly status: 403 = 403) {
    super(message)
    this.name = 'DataScopeError'
  }
}

export function isProductionDataScopeMode(value: string): value is ProductionDataScopeMode {
  return productionDataScopeModes.includes(value as ProductionDataScopeMode)
}

export function isInventoryDataScopeMode(value: string): value is InventoryDataScopeMode {
  return inventoryDataScopeModes.includes(value as InventoryDataScopeMode)
}
