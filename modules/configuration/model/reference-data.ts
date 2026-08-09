import type { ResourceAdvancedSearchField, ResourceSearchProfile } from '@/lib/resource-search'
import type { ConfiguredUnit, InventoryLocationConfig, MeasureType, PartyRecord, WorkCenterConfig } from '../contracts/reference-data'

export type { ConfiguredUnit, InventoryLocationConfig, MeasureType, PartyRecord, WorkCenterConfig } from '../contracts/reference-data'

export const measureTypeOptions: Array<[MeasureType, string, string]> = [
  ['LENGTH', '长度', 'm'],
  ['WEIGHT', '重量', 'kg'],
  ['QUANTITY', '数量', '件'],
  ['OTHER', '其他', '项'],
]

export const partySearchProfile: ResourceSearchProfile<PartyRecord> = {
  key: 'party.default',
  keywordFields: [
    { key: 'name', label: '名称', read: (item) => item.name, weight: 10 },
    { key: 'code', label: '编码', read: (item) => item.code, weight: 8 },
    { key: 'contact', label: '联系人', read: (item) => item.contact },
    { key: 'phone', label: '电话', read: (item) => item.phone },
    { key: 'address', label: '地址', read: (item) => item.address },
  ],
}

export const partyAdvancedFields: readonly ResourceAdvancedSearchField<PartyRecord>[] = [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name },
  { key: 'contact', label: '联系人', type: 'text', read: (item) => item.contact },
  { key: 'phone', label: '电话', type: 'text', read: (item) => item.phone },
  { key: 'address', label: '地址', type: 'text', read: (item) => item.address },
]

export const workCenterSearchProfile: ResourceSearchProfile<WorkCenterConfig> = {
  key: 'work-center.default',
  keywordFields: [
    { key: 'code', label: '编码', read: (item) => item.code, weight: 10 },
    { key: 'name', label: '名称', read: (item) => item.name, weight: 8 },
    { key: 'category', label: '类别', read: (item) => item.category },
    { key: 'note', label: '备注', read: (item) => item.note },
  ],
}

export const workCenterAdvancedFields: readonly ResourceAdvancedSearchField<WorkCenterConfig>[] = [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name },
  { key: 'category', label: '类别', type: 'text', read: (item) => item.category },
  { key: 'status', label: '状态', type: 'select', read: (item) => item.isActive ? 'active' : 'archived', options: [{ value: 'active', label: '启用' }, { value: 'archived', label: '已归档' }] },
]

export const locationSearchProfile: ResourceSearchProfile<InventoryLocationConfig> = {
  key: 'inventory-location.default',
  keywordFields: [
    { key: 'code', label: '编码', read: (item) => item.code, weight: 10 },
    { key: 'name', label: '名称', read: (item) => item.name, weight: 8 },
    { key: 'note', label: '备注', read: (item) => item.note },
  ],
}

export const locationAdvancedFields: readonly ResourceAdvancedSearchField<InventoryLocationConfig>[] = [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name },
  { key: 'status', label: '状态', type: 'select', read: (item) => item.isDefault ? 'default' : item.isActive ? 'active' : 'archived', options: [{ value: 'default', label: '默认' }, { value: 'active', label: '启用' }, { value: 'archived', label: '已归档' }] },
  { key: 'materialCount', label: '物料数', type: 'number', read: (item) => item.materialCount },
]

export const unitSearchProfile: ResourceSearchProfile<ConfiguredUnit> = {
  key: 'unit.default',
  keywordFields: [
    { key: 'code', label: '编码', read: (item) => item.code, weight: 10 },
    { key: 'name', label: '名称', read: (item) => item.name, weight: 8 },
    { key: 'measureType', label: '计量方式', read: (item) => measureTypeOptions.find(([value]) => value === item.measureType)?.[1] },
  ],
}

export const unitAdvancedFields: readonly ResourceAdvancedSearchField<ConfiguredUnit>[] = [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name },
  { key: 'measureType', label: '计量方式', type: 'select', read: (item) => item.measureType, options: measureTypeOptions.map(([value, label]) => ({ value, label })) },
  { key: 'usageCount', label: '使用次数', type: 'number', read: (item) => item.usageCount },
]
