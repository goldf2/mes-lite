import { z } from 'zod'

export const qualityInspectionSourceTypes = ['PRODUCTION_ORDER_ACTUAL_OUTPUT', 'RETURN_ORDER'] as const
export const qualitySamplingModes = ['FULL', 'FIXED', 'PERCENTAGE'] as const

const qualityInspectionStandardItemSchema = z.object({
  name: z.string().trim().min(1, '请填写检验项目').max(100, '检验项目不能超过 100 字'),
  method: z.string().trim().min(1, '请填写检验方法').max(200, '检验方法不能超过 200 字'),
  acceptanceCriteria: z.string().trim().min(1, '请填写接收标准').max(300, '接收标准不能超过 300 字'),
})

export const qualityInspectionStandardInputSchema = z.object({
  code: z.string().trim().min(1, '请填写标准编码').max(50, '标准编码不能超过 50 字').regex(/^[A-Za-z0-9._-]+$/, '标准编码只能包含字母、数字、点、横线和下划线'),
  name: z.string().trim().min(1, '请填写标准名称').max(100, '标准名称不能超过 100 字'),
  materialId: z.string().trim().min(1, '请选择适用物料'),
  sourceType: z.enum(qualityInspectionSourceTypes),
  samplingMode: z.enum(qualitySamplingModes),
  sampleValue: z.number().finite().min(0, '抽样值不能为负数'),
  minSampleQty: z.number().finite().min(0, '最低抽样数不能为负数').nullable().optional(),
  maxSampleQty: z.number().finite().positive('最高抽样数必须大于 0').nullable().optional(),
  changeReason: z.string().trim().min(1, '请填写建立或变更原因').max(300, '变更原因不能超过 300 字'),
  items: z.array(qualityInspectionStandardItemSchema).min(1, '至少添加一个检验项目').max(50, '最多添加 50 个检验项目'),
}).superRefine((input, context) => {
  if (input.samplingMode === 'FULL' && input.sampleValue !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '全检模式的抽样值必须为 0', path: ['sampleValue'] })
  }
  if (input.samplingMode === 'FIXED' && input.sampleValue <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '固定抽样数必须大于 0', path: ['sampleValue'] })
  }
  if (input.samplingMode === 'PERCENTAGE' && (input.sampleValue <= 0 || input.sampleValue > 100)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '抽样比例必须大于 0 且不超过 100%', path: ['sampleValue'] })
  }
  if (input.minSampleQty != null && input.maxSampleQty != null && input.minSampleQty > input.maxSampleQty) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '最低抽样数不能大于最高抽样数', path: ['minSampleQty'] })
  }
})

export const copyQualityInspectionStandardSchema = z.object({
  changeReason: z.string().trim().min(1, '请填写新版本变更原因').max(300, '变更原因不能超过 300 字'),
})

export const obsoleteQualityInspectionStandardSchema = z.object({
  reason: z.string().trim().min(1, '请填写停用原因').max(300, '停用原因不能超过 300 字'),
})

export type QualityInspectionStandardInput = z.infer<typeof qualityInspectionStandardInputSchema>
export type CopyQualityInspectionStandardInput = z.infer<typeof copyQualityInspectionStandardSchema>
export type ObsoleteQualityInspectionStandardInput = z.infer<typeof obsoleteQualityInspectionStandardSchema>
