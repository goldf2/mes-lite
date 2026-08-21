import { defineResourceSearchCatalog } from '@/lib/resource-search'
import type { QualityInspectionMaterialOption, QualityInspectionStandardView } from '../contracts/quality-inspection-standard'
import type { QualityTaskItem } from '../contracts/quality-task'

export const qualityTaskSearchFieldKeys = [
  'inspectionNo', 'lotNo', 'material', 'sourceType', 'sourceId', 'status', 'result', 'round',
  'inspectedQty', 'sampleQty', 'goodQty', 'badQty', 'inspector', 'standard', 'checkItem',
  'disposition', 'note', 'checkedAt', 'createdAt',
] as const

export const qualityTaskSearchCatalog = defineResourceSearchCatalog<QualityTaskItem>('quality-task.actual-fields', [
  { key: 'inspectionNo', label: '检验单号', type: 'text', read: (item) => item.inspectionNo },
  { key: 'lotNo', label: '内部批号', type: 'text', read: (item) => item.lot.lotNo },
  { key: 'material', label: '物料', type: 'text', read: (item) => [item.lot.material.code, item.lot.material.name, item.lot.material.stockUnit] },
  { key: 'sourceType', label: '来源类型', type: 'select', read: (item) => [item.sourceType, ({ PRODUCTION_ORDER_ACTUAL_OUTPUT: '生产入库', MATERIAL_IN: '来料入库', RETURN_ORDER: '退货入库' } as Record<string, string>)[item.sourceType]], options: [{ value: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', label: '生产入库' }, { value: 'MATERIAL_IN', label: '来料入库' }, { value: 'RETURN_ORDER', label: '退货入库' }] },
  { key: 'sourceId', label: '来源单据', type: 'text', read: (item) => item.sourceId },
  { key: 'status', label: '检验状态', type: 'select', read: (item) => item.status, options: [{ value: 'PENDING', label: '待检' }, { value: 'COMPLETED', label: '已完成' }, { value: 'CANCELLED', label: '已取消' }] },
  { key: 'result', label: '检验结果', type: 'select', read: (item) => item.result, options: [{ value: 'PENDING', label: '待检' }, { value: 'PASS', label: '合格' }, { value: 'FAIL', label: '不合格' }, { value: 'PARTIAL', label: '部分合格' }] },
  { key: 'round', label: '检验轮次', type: 'number', read: (item) => item.round },
  ...(['inspectedQty', 'sampleQty', 'goodQty', 'badQty'] as const).map((key) => ({ key, label: ({ inspectedQty: '检验数量', sampleQty: '抽样数量', goodQty: '合格数量', badQty: '不合格数量' })[key], type: 'number' as const, read: (item: QualityTaskItem) => item[key] })),
  { key: 'inspector', label: '检验人', type: 'text', read: (item) => item.inspector },
  { key: 'standard', label: '检验标准', type: 'text', read: (item) => [item.standardCodeSnapshot, item.standardNameSnapshot, item.standardVersionSnapshot] },
  { key: 'checkItem', label: '检验项目／方法／判定', type: 'text', read: (item) => item.checkItems.flatMap((entry) => [entry.name, entry.method, entry.acceptanceCriteria, entry.measuredValue, entry.result, entry.note]) },
  { key: 'disposition', label: '质量处置', type: 'text', read: (item) => item.dispositions.flatMap((entry) => [entry.dispositionNo, entry.action, entry.reason, entry.performedBy]) },
  { key: 'note', label: '检验备注', type: 'text', read: (item) => item.note },
  { key: 'checkedAt', label: '判定日期', type: 'date', read: (item) => item.checkedAt },
  { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
])

export const qualityStandardSearchFieldKeys = [
  'code', 'version', 'name', 'materialId', 'sourceType', 'samplingMode', 'sampleValue',
  'minSampleQty', 'maxSampleQty', 'status', 'changeReason', 'checkItem', 'createdBy',
  'releasedBy', 'releasedAt', 'obsoleteBy', 'obsoleteAt', 'createdAt', 'updatedAt',
] as const

export function buildQualityStandardSearchCatalog(materials: readonly QualityInspectionMaterialOption[] = []) {
  return defineResourceSearchCatalog<QualityInspectionStandardView>('quality-standard.actual-fields', [
    { key: 'code', label: '标准编号', type: 'text', read: (item) => item.code },
    { key: 'version', label: '版本', type: 'number', read: (item) => item.version },
    { key: 'name', label: '标准名称', type: 'text', read: (item) => item.name },
    { key: 'materialId', label: '物料', type: materials.length ? 'select' : 'text', read: (item) => [item.materialId, item.material.code, item.material.name, item.material.stockUnit], options: materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })) },
    { key: 'sourceType', label: '适用来源', type: 'select', read: (item) => item.sourceType, options: [{ value: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', label: '生产入库' }, { value: 'MATERIAL_IN', label: '来料入库' }, { value: 'RETURN_ORDER', label: '退货入库' }] },
    { key: 'samplingMode', label: '抽样方式', type: 'select', read: (item) => item.samplingMode, options: [{ value: 'FULL', label: '全检' }, { value: 'FIXED', label: '固定数量' }, { value: 'PERCENTAGE', label: '比例抽样' }] },
    ...(['sampleValue', 'minSampleQty', 'maxSampleQty'] as const).map((key) => ({ key, label: ({ sampleValue: '抽样值', minSampleQty: '最低抽样量', maxSampleQty: '最高抽样量' })[key], type: 'number' as const, read: (item: QualityInspectionStandardView) => item[key] })),
    { key: 'status', label: '状态', type: 'select', read: (item) => item.status, options: [{ value: 'DRAFT', label: '草稿' }, { value: 'RELEASED', label: '已发布' }, { value: 'OBSOLETE', label: '已停用' }] },
    { key: 'changeReason', label: '变更原因', type: 'text', read: (item) => item.changeReason },
    { key: 'checkItem', label: '检验项目／方法／标准', type: 'text', read: (item) => item.items.flatMap((entry) => [entry.name, entry.method, entry.acceptanceCriteria]) },
    { key: 'createdBy', label: '创建人', type: 'text', read: (item) => item.createdBy },
    { key: 'releasedBy', label: '发布人', type: 'text', read: (item) => item.releasedBy },
    { key: 'releasedAt', label: '发布日期', type: 'date', read: (item) => item.releasedAt },
    { key: 'obsoleteBy', label: '停用人', type: 'text', read: (item) => item.obsoleteBy },
    { key: 'obsoleteAt', label: '停用日期', type: 'date', read: (item) => item.obsoleteAt },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (item) => item.createdAt },
    { key: 'updatedAt', label: '更新日期', type: 'date', read: (item) => item.updatedAt },
  ])
}
