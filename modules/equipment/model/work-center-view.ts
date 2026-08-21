import { defineResourceSearchCatalog, resourceAdvancedFields, resourceKeywordProfile } from '@/lib/resource-search'
import type { WorkCenterConfig } from '../contracts/equipment'

export const workCenterSearchCatalog = defineResourceSearchCatalog<WorkCenterConfig>('work-center.default', [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, weight: 10, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name, weight: 8 },
  { key: 'category', label: '类别', type: 'text', read: (item) => item.category },
  { key: 'note', label: '备注', type: 'text', read: (item) => item.note },
  {
    key: 'status',
    label: '状态',
    type: 'select',
    read: (item) => item.isActive ? ['active', '启用'] : ['archived', '已归档'],
    options: [{ value: 'active', label: '启用' }, { value: 'archived', label: '已归档' }],
  },
  { key: 'equipmentCount', label: '设备数', type: 'number', read: (item) => item._count.equipment },
  { key: 'documentCount', label: '工艺文档数', type: 'number', read: (item) => item._count.workInstructions },
])
export const workCenterSearchProfile = resourceKeywordProfile(workCenterSearchCatalog)
export const workCenterAdvancedFields = resourceAdvancedFields(workCenterSearchCatalog)
