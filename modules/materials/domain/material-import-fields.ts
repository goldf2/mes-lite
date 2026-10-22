import { toCsv } from '@/lib/csv'
import { materialExtensionScalarFields } from '../contracts/material-schema'
import type { MaterialImportField } from '../contracts/material-import'

const text = (key: string, label: string, aliases: string[] = [], required = false): MaterialImportField => ({ key, label, aliases: [key, label, ...aliases], type: 'text', required })
const number = (key: string, label: string, aliases: string[] = []): MaterialImportField => ({ ...text(key, label, aliases), type: 'number' })
const boolean = (key: string, label: string, aliases: string[] = []): MaterialImportField => ({ ...text(key, label, aliases), type: 'boolean' })

const engineeringMetadata: Record<string, MaterialImportField> = {
  materialKind: text('materialKind', '物料种类'),
  defaultSourceMode: text('defaultSourceMode', '默认来源'),
  drawingNo: text('drawingNo', '图号'),
  currentMaterial: text('currentMaterial', '现用材料'),
  materialJis: text('materialJis', '材料（JIS）', ['材料(JIS)', 'JIS材质']),
  materialGb: text('materialGb', '材料（GB）', ['材料(GB)', 'GB材质']),
  drawingSize: text('drawingSize', '图幅'),
  feedCategory: text('feedCategory', '投料类别'),
  feedSpec: text('feedSpec', '投料规格'),
  feedMethod: text('feedMethod', '投料方式'),
  heatTreatmentProcess: text('heatTreatmentProcess', '热处理工艺'),
  machiningProcess: text('machiningProcess', '加工工艺'),
  grossWeightText: text('grossWeightText', '毛重原文', ['毛重']),
  heatTreatment: boolean('heatTreatment', '热处理'),
  heatTreatmentConfirmed: boolean('heatTreatmentConfirmed', '热处理已确认'),
  finishedLength: number('finishedLength', '净长(mm)', ['长(净)', '长（净）', '净长']),
  blankLength: number('blankLength', '毛长(mm)', ['长(毛)', '长（毛）', '毛长']),
  finishedWidth: number('finishedWidth', '净宽(mm)', ['宽(净)', '宽（净）', '净宽']),
  blankWidth: number('blankWidth', '毛宽(mm)', ['宽(毛)', '宽（毛）', '毛宽']),
  finishedThickness: number('finishedThickness', '净厚(mm)', ['厚(净)', '厚（净）', '净厚']),
  blankThickness: number('blankThickness', '毛厚(mm)', ['厚(毛)', '厚（毛）', '毛厚']),
  finishedInnerDiameter: number('finishedInnerDiameter', '净内径(mm)', ['内径(净）', '内径(净)', '净内径']),
  blankInnerDiameter: number('blankInnerDiameter', '毛内径(mm)', ['内径(毛）', '内径(毛)', '毛内径']),
  finishedOuterDiameter: number('finishedOuterDiameter', '净外径(mm)', ['外径(净）', '外径(净)', '净外径']),
  blankOuterDiameter: number('blankOuterDiameter', '毛外径(mm)', ['外径(毛）', '外径(毛)', '毛外径']),
  finishedHeight: number('finishedHeight', '净高(mm)', ['高度(净)', '高度（净）', '净高']),
  blankHeight: number('blankHeight', '毛高(mm)', ['高度(毛)', '高度（毛）', '毛高']),
}

/** This registry is the only import mapping/export column catalog. It never contains inventory/cost balances. */
export const materialImportFields: MaterialImportField[] = [
  text('code', '物料编码', ['编码', '配合零件编码'], true),
  text('name', '物料名称', ['名称'], true),
  text('spec', '规格'), text('note', '备注', ['备注栏', '说明']),
  text('category', '分类', ['物料分类']),
  text('customerName', '归属客户', ['客户', '客户名称', '归属客户名称']),
  text('customerCode', '客户编码', ['归属客户编码']),
  text('primaryMeasure', '主计量方式', ['主计量类型']),
  text('stockUnit', '库存单位', ['领料单位', '单位']),
  boolean('useDualUnit', '启用双单位', ['双单位']),
  text('referenceMeasure', '参考计量方式', ['核算计量方式']),
  text('valuationUnit', '核算单位', ['计价单位', '参考/计价单位']),
  number('conversionRate', '换算系数', ['换算率', '默认参考换算']),
  text('conversionNote', '换算说明'), text('costingMethod', '成本方法', ['成本核算方法']),
  number('defaultSalePrice', '默认销售价', ['销售价']), text('salesCurrency', '销售币种', ['币种']),
  ...materialExtensionScalarFields.map((key) => {
    const field = engineeringMetadata[key]
    if (!field) throw new Error(`物料导入字段缺少元数据：${key}`)
    return field
  }),
  { ...text('purposeCodes', '用途', ['用途代码']), type: 'list', hint: '多项以分号分隔；空白表示不提供用途' },
  { ...text('modelUsagesJson', '适用机型记录(JSON)', ['modelUsages']), hint: '完整 JSON 数组；更新时替换全部适用关系，[] 明确清空' },
  text('modelCode', '适用机型', ['型号', '机型']),
  text('assemblyName', '部件'),
  { ...number('quantityPerMachine', '每台数量'), hint: '仅适用关系数量，空值和零均保留，不是库存' },
]
export const materialImportFieldByKey = new Map(materialImportFields.map((field) => [field.key, field]))
export function normalizeMaterialImportHeader(value: string) {
  return value.trim().replace(/^\uFEFF/, '').replace(/[（]/g, '(').replace(/[）]/g, ')').toLowerCase()
}
export function autoMapMaterialColumns(headers: string[]) {
  const mapping: Record<string, number | null> = {}
  const warnings: string[] = []
  const owners = new Map<number, string[]>()
  for (const field of materialImportFields) {
    const aliases = new Set(field.aliases.map(normalizeMaterialImportHeader))
    const matches = headers.flatMap((header, index) => aliases.has(normalizeMaterialImportHeader(header)) ? [index] : [])
    mapping[field.key] = matches.length === 1 ? matches[0] : null
    if (matches.length > 1) warnings.push(`${field.label} 匹配到多个源列，请手动选择`)
    if (matches.length === 1) owners.set(matches[0], [...(owners.get(matches[0]) || []), field.key])
  }
  for (const keys of Array.from(owners.values())) {
    if (keys.length < 2) continue
    for (const key of keys) mapping[key] = null
    warnings.push(`同一源列可对应多个字段：${keys.join('、')}，请手动选择`)
  }
  return { mapping, warnings }
}

export function materialImportTemplateCsv() {
  const fields = materialImportFields.filter((field) => !['modelUsagesJson','customerCode'].includes(field.key))
  const example: Record<string, unknown> = { code: 'PART-EXAMPLE-001', name: '示例零件（请替换或删除示例行）', spec: '', note: '', category: 'OTHER',
    primaryMeasure: 'QUANTITY', stockUnit: '件', useDualUnit: false, valuationUnit: '件', conversionRate: 1, costingMethod: 'WEIGHTED_AVERAGE', salesCurrency: 'CNY',
    materialKind: 'PART', drawingNo: '001A', materialGb: '45#', modelCode: '示例机型', assemblyName: '送料', quantityPerMachine: 1 }
  return toCsv([fields.map((field) => field.label), fields.map((field) => example[field.key] ?? '')])
}
