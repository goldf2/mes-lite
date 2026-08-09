export const materialCategoryOptions = [
  ['RAW', '原材料'],
  ['FINISHED', '成品'],
  ['AUXILIARY', '辅材'],
  ['SCRAP', '废料'],
  ['DEFECTIVE', '废品'],
  ['PACKAGING', '包装物'],
  ['OTHER', '其他'],
] as const

export const materialCategoryLabels = Object.fromEntries(materialCategoryOptions) as Record<string, string>

export const materialCategoryFilterOptions = materialCategoryOptions.map(([value, label]) => ({ value, label }))

export const primaryMeasureOptions = [
  ['LENGTH', '长度'],
  ['WEIGHT', '重量'],
  ['QUANTITY', '数量'],
  ['OTHER', '其他'],
] as const

export const primaryMeasureLabels = Object.fromEntries(primaryMeasureOptions) as Record<string, string>
