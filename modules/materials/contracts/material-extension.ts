import { z } from 'zod'

export const materialKinds = ['GENERAL', 'PART'] as const
export const materialSourceModes = ['MAKE', 'BUY', 'SUBCONTRACT'] as const
export const materialPurposeCodes = ['OWN_EQUIPMENT', 'OWN_PRODUCT', 'EXTERNAL_PROCESSING', 'OTHER'] as const
export const materialPurposeOptions = [
  { value: 'OWN_EQUIPMENT', label: '自有设备维护' },
  { value: 'OWN_PRODUCT', label: '自有产品制造' },
  { value: 'EXTERNAL_PROCESSING', label: '对外加工' },
  { value: 'OTHER', label: '其他用途' },
] as const

export const materialEngineeringTextFields = [
  'drawingNo', 'currentMaterial', 'materialJis', 'materialGb', 'drawingSize',
  'feedCategory', 'feedSpec', 'feedMethod', 'heatTreatmentProcess', 'machiningProcess', 'grossWeightText',
] as const
export const materialDimensionFields = [
  'finishedLength', 'blankLength', 'finishedWidth', 'blankWidth',
  'finishedThickness', 'blankThickness', 'finishedInnerDiameter', 'blankInnerDiameter',
  'finishedOuterDiameter', 'blankOuterDiameter', 'finishedHeight', 'blankHeight',
] as const
export const materialBooleanFields = ['heatTreatment', 'heatTreatmentConfirmed'] as const
export const materialExtensionScalarFields = [
  'materialKind', 'defaultSourceMode', ...materialEngineeringTextFields, ...materialBooleanFields, ...materialDimensionFields,
] as const

const optionalText = z.string().max(10000).nullable().optional()
const optionalDimension = z.number().finite().nonnegative().nullable().optional()
export const materialModelUsageInputSchema = z.object({
  modelCode: z.string().trim().min(1, '适用机型不能为空').max(200),
  assemblyName: z.string().trim().max(200).nullable().optional(),
  quantityPerMachine: z.number().finite().nonnegative().nullable().optional(),
})

export const materialExtensionInputSchema = z.object({
  materialKind: z.enum(materialKinds).optional(),
  defaultSourceMode: z.enum(materialSourceModes).nullable().optional(),
  drawingNo: optionalText,
  currentMaterial: optionalText,
  materialJis: optionalText,
  materialGb: optionalText,
  drawingSize: optionalText,
  feedCategory: optionalText,
  feedSpec: optionalText,
  feedMethod: optionalText,
  heatTreatmentProcess: optionalText,
  heatTreatment: z.boolean().nullable().optional(),
  heatTreatmentConfirmed: z.boolean().nullable().optional(),
  machiningProcess: optionalText,
  grossWeightText: optionalText,
  finishedLength: optionalDimension,
  blankLength: optionalDimension,
  finishedWidth: optionalDimension,
  blankWidth: optionalDimension,
  finishedThickness: optionalDimension,
  blankThickness: optionalDimension,
  finishedInnerDiameter: optionalDimension,
  blankInnerDiameter: optionalDimension,
  finishedOuterDiameter: optionalDimension,
  blankOuterDiameter: optionalDimension,
  finishedHeight: optionalDimension,
  blankHeight: optionalDimension,
  purposeCodes: z.array(z.enum(materialPurposeCodes)).max(4).refine((codes) => new Set(codes).size === codes.length, '物料用途不能重复').optional(),
  modelUsages: z.array(materialModelUsageInputSchema).max(1000).superRefine((rows, context) => {
    const seen = new Set<string>()
    rows.forEach((row, index) => {
      const key = JSON.stringify([row.modelCode, row.assemblyName || ''])
      if (seen.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'modelCode'], message: '相同机型和分组不能重复' })
      seen.add(key)
    })
  }).optional(),
})

export type MaterialExtensionInput = z.infer<typeof materialExtensionInputSchema>
export type MaterialModelUsageInput = z.infer<typeof materialModelUsageInputSchema>
