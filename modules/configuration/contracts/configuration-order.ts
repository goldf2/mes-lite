export const configurationOrderEntities = [
  'locations',
  'suppliers',
  'customers',
  'employees',
  'workCenters',
  'processTemplates',
  'processRoutes',
  'units',
] as const

export type ConfigurationOrderEntity = (typeof configurationOrderEntities)[number]

export interface ConfigurationOrderItem {
  id: string
  label: string
  detail?: string
  group?: string
  sortOrder: number
}
