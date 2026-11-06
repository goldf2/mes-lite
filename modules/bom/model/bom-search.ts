import { defineResourceSearchCatalog, resourceAdvancedFields } from '@/lib/resource-search'
import type { BomSearchRow } from '../contracts'

export const bomSearchCatalog = defineResourceSearchCatalog<BomSearchRow>('boms.actual-fields', [
  { key: 'output', label: '产出物料', type: 'text', read: ({ product, bom, material }) => [product.sku, product.name, material?.code, material?.name, material?.spec, ...bom.outputs.flatMap((output) => [output.material.code, output.material.name, output.material.spec])] },
  { key: 'input', label: '投入物料', type: 'text', read: ({ bom }) => bom.items.flatMap((item) => [item.material?.code, item.material?.name, item.material?.spec]) },
  { key: 'name', label: 'BOM 名称', type: 'text', read: ({ product, bom }) => [product.description, bom.name] },
  { key: 'version', label: '版本', type: 'text', read: ({ bom }) => bom.version },
  { key: 'purpose', label: '用途', type: 'select', read: ({ bom }) => bom.purpose, options: [{ value: 'PRODUCTION', label: '生产 BOM' }, { value: 'PACKAGING', label: '包装 BOM' }] },
  { key: 'status', label: '启用状态', type: 'select', read: ({ bom }) => bom.isActive ? 'active' : 'inactive', options: [{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }] },
  { key: 'default', label: '默认方案', type: 'select', read: ({ bom }) => bom.isDefault ? 'default' : 'other', options: [{ value: 'default', label: '默认 BOM' }, { value: 'other', label: '非默认 BOM' }] },
])
export const bomAdvancedSearchFields = resourceAdvancedFields(bomSearchCatalog)
