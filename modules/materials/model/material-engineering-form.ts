import type { Material } from '../contracts'
import {
  materialBooleanFields,
  materialDimensionFields,
  materialExtensionInputSchema,
  materialExtensionScalarFields,
  type MaterialExtensionInput,
} from '../contracts/material-extension'

export type MaterialEngineeringField = (typeof materialExtensionScalarFields)[number]
export type MaterialPurposeCode = NonNullable<MaterialExtensionInput['purposeCodes']>[number]

export interface MaterialModelUsageForm {
  clientKey: string
  modelCode: string
  assemblyName: string
  quantityPerMachine: string
}

export interface MaterialEngineeringForm {
  values: Record<MaterialEngineeringField, string>
  purposeCodes: MaterialPurposeCode[]
  modelUsages: MaterialModelUsageForm[]
  dirty: Partial<Record<keyof MaterialExtensionInput, true>>
}

export const materialEngineeringTextLabels = {
  drawingNo: '图号',
  currentMaterial: '现用材料',
  materialJis: '材料（JIS 参考）',
  materialGb: '材料（GB 参考）',
  drawingSize: '图幅',
  feedCategory: '投料类别',
  feedSpec: '投料规格',
  feedMethod: '投料方式',
  heatTreatmentProcess: '热处理工艺',
  machiningProcess: '加工工艺',
  grossWeightText: '毛重说明',
} as const

export const materialDimensionRows = [
  { label: '长', finished: 'finishedLength', blank: 'blankLength' },
  { label: '宽', finished: 'finishedWidth', blank: 'blankWidth' },
  { label: '厚', finished: 'finishedThickness', blank: 'blankThickness' },
  { label: '内径', finished: 'finishedInnerDiameter', blank: 'blankInnerDiameter' },
  { label: '外径', finished: 'finishedOuterDiameter', blank: 'blankOuterDiameter' },
  { label: '高度', finished: 'finishedHeight', blank: 'blankHeight' },
] as const

export const materialKindLabels: Record<string, string> = { GENERAL: '通用物料', PART: '零件' }
export const materialSourceModeLabels: Record<string, string> = { MAKE: '自制', BUY: '外购', SUBCONTRACT: '委外' }

export function createMaterialEngineeringForm(material: Material | null): MaterialEngineeringForm {
  const values = Object.fromEntries(materialExtensionScalarFields.map((field) => {
    const value = material?.[field]
    return [field, value == null ? '' : String(value)]
  })) as Record<MaterialEngineeringField, string>
  if (!material) values.materialKind = 'GENERAL'
  return {
    values,
    purposeCodes: [...(material?.purposeCodes || [])],
    modelUsages: (material?.modelUsages || []).map((usage, index) => ({
      clientKey: `existing-${index}`,
      modelCode: usage.modelCode,
      assemblyName: usage.assemblyName || '',
      quantityPerMachine: usage.quantityPerMachine == null ? '' : String(usage.quantityPerMachine),
    })),
    dirty: material ? {} : { materialKind: true },
  }
}

export function materialEngineeringInput(form: MaterialEngineeringForm): MaterialExtensionInput {
  const input: Record<string, unknown> = {}
  for (const field of materialExtensionScalarFields) {
    if (!form.dirty[field]) continue
    const value = form.values[field]
    if (field === 'materialKind') {
      if (value) input[field] = value
    } else if ((materialDimensionFields as readonly string[]).includes(field)) {
      input[field] = value.trim() === '' ? null : Number(value)
    } else if ((materialBooleanFields as readonly string[]).includes(field)) {
      input[field] = value === '' ? null : value === 'true'
    } else {
      input[field] = value.trim() === '' ? null : value
    }
  }
  if (form.dirty.purposeCodes) input.purposeCodes = form.purposeCodes
  if (form.dirty.modelUsages) {
    input.modelUsages = form.modelUsages.map((usage) => ({
      modelCode: usage.modelCode.trim(),
      assemblyName: usage.assemblyName.trim() || null,
      quantityPerMachine: usage.quantityPerMachine.trim() === '' ? null : Number(usage.quantityPerMachine),
    }))
  }
  const result = materialExtensionInputSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = String(issue.path[0] || '')
    if ((materialDimensionFields as readonly string[]).includes(field)) throw new Error('工程尺寸须填写不小于 0 的有效数值，或留空。')
    if (field === 'modelUsages') throw new Error(`适用机型用量：${issue.message}`)
    throw new Error(issue.message)
  }
  return result.data
}
