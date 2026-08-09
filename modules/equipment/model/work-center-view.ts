import type { ResourceAdvancedSearchField, ResourceSearchProfile } from '@/lib/resource-search'
import type { WorkCenterConfig } from '../contracts/equipment'

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
  {
    key: 'status',
    label: '状态',
    type: 'select',
    read: (item) => item.isActive ? 'active' : 'archived',
    options: [{ value: 'active', label: '启用' }, { value: 'archived', label: '已归档' }],
  },
]
