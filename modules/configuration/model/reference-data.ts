import { defineResourceSearchCatalog, resourceAdvancedFields, resourceKeywordProfile } from '@/lib/resource-search'
import type { ConfiguredUnit, InventoryLocationConfig, MeasureType, PartyRecord } from '../contracts/reference-data'

export type { ConfiguredUnit, InventoryLocationConfig, MeasureType, PartyRecord } from '../contracts/reference-data'

export const measureTypeOptions: Array<[MeasureType, string, string]> = [
  ['LENGTH', '长度', 'm'],
  ['WEIGHT', '重量', 'kg'],
  ['QUANTITY', '数量', '件'],
  ['OTHER', '其他', '项'],
]

export const partySearchCatalog = defineResourceSearchCatalog<PartyRecord>('party.default', [
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name, weight: 10 },
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, weight: 8, operators: ['equals', 'startsWith'] },
  { key: 'contact', label: '联系人', type: 'text', read: (item) => item.contact },
  { key: 'phone', label: '电话', type: 'text', read: (item) => item.phone },
  { key: 'address', label: '地址', type: 'text', read: (item) => item.address },
])
export const partySearchProfile = resourceKeywordProfile(partySearchCatalog)
export const partyAdvancedFields = resourceAdvancedFields(partySearchCatalog)

export const locationSearchCatalog = defineResourceSearchCatalog<InventoryLocationConfig>('inventory-location.default', [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, weight: 10, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name, weight: 8 },
  { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
  { key: 'status', label: '状态', type: 'select', read: (item) => item.isDefault ? ['default', '默认'] : item.isActive ? ['active', '启用'] : ['archived', '已归档'], options: [{ value: 'default', label: '默认' }, { value: 'active', label: '启用' }, { value: 'archived', label: '已归档' }] },
  { key: 'materialCount', label: '物料数', type: 'number', read: (item) => item.materialCount },
  { key: 'qty', label: '库存数量', type: 'number', read: (item) => item.qty },
  { key: 'reservedQty', label: '占用数量', type: 'number', read: (item) => item.reservedQty },
  { key: 'availableQty', label: '可用数量', type: 'number', read: (item) => item.availableQty },
])
export const locationSearchProfile = resourceKeywordProfile(locationSearchCatalog)
export const locationAdvancedFields = resourceAdvancedFields(locationSearchCatalog)

export const unitSearchCatalog = defineResourceSearchCatalog<ConfiguredUnit>('unit.default', [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, weight: 10, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name, weight: 8 },
  { key: 'measureType', label: '计量方式', type: 'select', read: (item) => [item.measureType, measureTypeOptions.find(([value]) => value === item.measureType)?.[1]], options: measureTypeOptions.map(([value, label]) => ({ value, label })) },
  { key: 'usageCount', label: '使用次数', type: 'number', read: (item) => item.usageCount },
])
export const unitSearchProfile = resourceKeywordProfile(unitSearchCatalog)
export const unitAdvancedFields = resourceAdvancedFields(unitSearchCatalog)
