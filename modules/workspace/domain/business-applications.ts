import type { WorkspaceFunctionKey } from '@/lib/workspace'
import { getAvailableBusinessModules } from './business-modules'

export type BusinessApplicationKey = 'mes' | 'customers'

export interface BusinessApplicationDefinition {
  key: BusinessApplicationKey
  label: string
  description: string
  ownerApp: 'mes' | 'data-platform'
}

export const businessApplicationDefinitions: readonly BusinessApplicationDefinition[] = [
  { key: 'mes', label: 'MES Lite', description: '制造经营工作台，涵盖生产、销售、物料、库存、收发和本厂设备。', ownerApp: 'mes' },
  { key: 'customers', label: '客户管理', description: '维护正式客户、联系人和地点，在地图上查看客户分布，并管理客户设备与服务资料。', ownerApp: 'data-platform' },
]

/** Application navigation only; it does not grant access to either application's data. */
export function getAvailableBusinessApplications<T extends { key: WorkspaceFunctionKey }>(items: readonly T[]) {
  const availableModules = getAvailableBusinessModules(items)
  return businessApplicationDefinitions.flatMap((application) => {
    const modules = availableModules.filter((module) => module.ownerApp === application.ownerApp)
    const functionKeys = new Set(modules.flatMap((module) => module.items.map((item) => item.key)))
    const applicationItems = items.filter((item) => functionKeys.has(item.key) || (application.key === 'mes' && item.key === 'dashboard'))
    return applicationItems.length > 0 ? [{ ...application, items: applicationItems, modules }] : []
  })
}

export type AvailableBusinessApplication<T extends { key: WorkspaceFunctionKey }> = ReturnType<typeof getAvailableBusinessApplications<T>>[number]
