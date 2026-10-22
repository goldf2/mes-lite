import { defineResourceSearchCatalog, type ResourceSearchField } from '@/lib/resource-search'
import type { CustomerOption, Material } from '../contracts'
import { materialCategoryFilterOptions } from './material-options'
import { materialDimensionFields, materialEngineeringTextFields, materialPurposeOptions } from '../contracts/material-extension'

export const materialSearchFieldKeys = [
  'code', 'name', 'spec', 'category', 'customerId', 'primaryMeasure', 'referenceMeasure',
  'unit', 'stockUnit', 'valuationUnit', 'conversionRate', 'conversionNote', 'costingMethod',
  'defaultSalePrice', 'salesCurrency', 'bomStatus', 'note', 'stockQty', 'availableQty',
  'valuationQty', 'totalCost', 'createdAt',
  'materialKind', 'defaultSourceMode', ...materialEngineeringTextFields, 'heatTreatment', 'heatTreatmentConfirmed',
  ...materialDimensionFields, 'purposeCodes', 'modelCode', 'assemblyName', 'quantityPerMachine',
] as const

const engineeringLabels: Record<typeof materialEngineeringTextFields[number], string> = {
  drawingNo: '图号', currentMaterial: '现用材料', materialJis: '材料（JIS来源）', materialGb: '材料（GB来源）',
  drawingSize: '图幅', feedCategory: '投料类别', feedSpec: '投料规格', feedMethod: '投料方式',
  heatTreatmentProcess: '热处理工艺', machiningProcess: '加工工艺', grossWeightText: '毛重原文',
}
const dimensionLabels: Record<typeof materialDimensionFields[number], string> = {
  finishedLength: '长（净，mm）', blankLength: '长（毛，mm）', finishedWidth: '宽（净，mm）', blankWidth: '宽（毛，mm）',
  finishedThickness: '厚（净，mm）', blankThickness: '厚（毛，mm）', finishedInnerDiameter: '内径（净，mm）', blankInnerDiameter: '内径（毛，mm）',
  finishedOuterDiameter: '外径（净，mm）', blankOuterDiameter: '外径（毛，mm）', finishedHeight: '高（净，mm）', blankHeight: '高（毛，mm）',
}
const kindOptions = [{ value: 'GENERAL', label: '通用物料' }, { value: 'PART', label: '零件' }]
const sourceOptions = [{ value: 'MAKE', label: '自制' }, { value: 'BUY', label: '外购' }, { value: 'SUBCONTRACT', label: '委外' }]
const booleanOptions = [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]

const measureOptions = [
  { value: 'LENGTH', label: '长度' }, { value: 'WEIGHT', label: '重量' },
  { value: 'QUANTITY', label: '数量' }, { value: 'OTHER', label: '其他' },
]
const costingOptions = [{ value: 'WEIGHTED_AVERAGE', label: '加权平均' }, { value: 'FIFO', label: '先进先出' }]
export const materialBomStatusOptions = [
  { value: 'NONE', label: '未建立产出 BOM' }, { value: 'NO_ACTIVE', label: '有 BOM 但无启用方案' },
  { value: 'NO_DEFAULT', label: '有启用方案但无默认方案' }, { value: 'READY', label: '已有可用默认 BOM' },
]

export function buildMaterialSearchCatalog(customers: readonly CustomerOption[], includeBom: boolean) {
  const fields: ResourceSearchField<Material>[] = [
    { key: 'code', label: '物料编码', type: 'text', read: (material) => material.code },
    { key: 'name', label: '物料名称', type: 'text', read: (material) => material.name },
    { key: 'spec', label: '规格', type: 'text', read: (material) => material.spec },
    { key: 'category', label: '物料分类', type: 'select', read: (material) => [material.category, materialCategoryFilterOptions.find((option) => option.value === material.category)?.label], options: materialCategoryFilterOptions },
    { key: 'customerId', label: '归属客户', type: 'select', read: (material) => [material.customerId || '__UNASSIGNED__', material.customer?.code, material.customer?.name], options: [{ value: '__UNASSIGNED__', label: '通用/未绑定' }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))] },
    { key: 'primaryMeasure', label: '主计量方式', type: 'select', read: (material) => [material.primaryMeasure, measureOptions.find((option) => option.value === material.primaryMeasure)?.label], options: measureOptions },
    { key: 'referenceMeasure', label: '辅助计量方式', type: 'select', read: (material) => [material.referenceMeasure, measureOptions.find((option) => option.value === material.referenceMeasure)?.label], options: measureOptions },
    { key: 'unit', label: '主单位', type: 'text', read: (material) => material.unit },
    { key: 'stockUnit', label: '库存单位', type: 'text', read: (material) => material.stockUnit },
    { key: 'valuationUnit', label: '计价单位', type: 'text', read: (material) => material.valuationUnit },
    { key: 'conversionRate', label: '单位换算率', type: 'number', read: (material) => material.conversionRate },
    { key: 'conversionNote', label: '换算说明', type: 'text', read: (material) => material.conversionNote },
    { key: 'costingMethod', label: '计价方法', type: 'select', read: (material) => [material.costingMethod, costingOptions.find((option) => option.value === material.costingMethod)?.label], options: costingOptions },
    { key: 'defaultSalePrice', label: '默认销售价', type: 'number', read: (material) => material.defaultSalePrice },
    { key: 'salesCurrency', label: '销售币种', type: 'select', read: (material) => [material.salesCurrency, material.salesCurrency === 'CNY' ? '人民币' : undefined], options: [{ value: 'CNY', label: '人民币' }] },
    { key: 'note', label: '备注', type: 'text', read: (material) => material.note },
    { key: 'stockQty', label: '库存数量', type: 'number', read: (material) => material.stock?.qty },
    { key: 'availableQty', label: '可用数量', type: 'number', read: (material) => material.stock?.availableQty },
    { key: 'valuationQty', label: '计价数量', type: 'number', read: (material) => material.stock?.valuationQty },
    { key: 'totalCost', label: '库存总成本', type: 'number', read: (material) => material.stock?.totalCost },
    { key: 'createdAt', label: '创建日期', type: 'date', read: (material) => material.createdAt },
    { key: 'materialKind', label: '物料身份', type: 'select', options: kindOptions, read: (material) => [material.materialKind, kindOptions.find((option) => option.value === material.materialKind)?.label] },
    { key: 'defaultSourceMode', label: '默认来源方式', type: 'select', options: sourceOptions, read: (material) => [material.defaultSourceMode, sourceOptions.find((option) => option.value === material.defaultSourceMode)?.label] },
    ...materialEngineeringTextFields.map((field) => ({ key: field, label: engineeringLabels[field], type: 'text' as const, read: (material: Material) => material[field] })),
    { key: 'heatTreatment', label: '热处理标记', type: 'select', options: booleanOptions, read: (material) => material.heatTreatment == null ? '' : String(material.heatTreatment) },
    { key: 'heatTreatmentConfirmed', label: '热处理已确认标记', type: 'select', options: booleanOptions, read: (material) => material.heatTreatmentConfirmed == null ? '' : String(material.heatTreatmentConfirmed) },
    ...materialDimensionFields.map((field) => ({ key: field, label: dimensionLabels[field], type: 'number' as const, read: (material: Material) => material[field] })),
    { key: 'purposeCodes', label: '物料用途', type: 'select', options: [...materialPurposeOptions], read: (material) => material.purposeCodes?.flatMap((code) => [code, materialPurposeOptions.find((option) => option.value === code)?.label || '']) },
    { key: 'modelCode', label: '适用机型', type: 'text', read: (material) => material.modelUsages?.map((usage) => usage.modelCode) },
    { key: 'assemblyName', label: '机型内部件分组', type: 'text', read: (material) => material.modelUsages?.map((usage) => usage.assemblyName || '') },
    { key: 'quantityPerMachine', label: '每台参考用量', type: 'number', read: (material) => material.modelUsages?.map((usage) => usage.quantityPerMachine).filter((quantity): quantity is number => quantity != null) },
  ]
  if (includeBom) fields.splice(15, 0, { key: 'bomStatus', label: 'BOM 状态', type: 'select', read: () => '', options: materialBomStatusOptions, keyword: false })
  return defineResourceSearchCatalog<Material>('material.actual-fields', fields)
}
