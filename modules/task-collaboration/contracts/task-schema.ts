import { z } from 'zod'
const id = z.string().min(1).max(100)
const text = (max: number) => z.string().trim().max(max).nullable().optional()
export const taskFileRefSchema = z.object({ attachmentId: id, versionLabel: z.string().trim().max(100).optional() }).strict()
const refs = z.array(taskFileRefSchema).max(100).default([])
export const taskLineSchema = z.object({
  id: id.optional(), materialId: id, quantity: z.number().finite().positive(), unit: z.string().trim().min(1).max(30),
  note: text(2000), documentRefs: refs,
}).strict()
export const taskDraftSchema = z.object({
  title: z.string().trim().min(1).max(200), salesOrderId: id.nullable().optional(), productionOrderId: id.nullable().optional(),
  assigneeEmployeeId: id.nullable().optional(), supplierId: id.nullable().optional(), workCenterId: id.nullable().optional(),
  quantity: z.number().finite().positive(), unit: z.string().trim().min(1).max(30),
  dueAt: z.string().datetime().nullable().optional(), instructions: text(10000), documentRefs: refs,
  lines: z.array(taskLineSchema).max(200).default([]),
}).strict()
export const createTaskSchema = taskDraftSchema.extend({ templateTaskId: id.optional() })
export const updateTaskSchema = taskDraftSchema.extend({ expectedRevision: z.number().int().positive() })
export const revisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict()
export const assignTaskSchema = revisionSchema.extend({ dispatchId: id.optional() })
export const progressSchema = z.object({
  kind: z.enum(['NOTE', 'EXCEPTION']), note: z.string().trim().min(1).max(10000), attachmentRefs: refs,
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(), expectedRevision: z.number().int().positive().optional(),
}).strict()
export const recipientSchema = z.object({ kind: z.enum(['EMPLOYEE', 'SUPPLIER', 'INTERNAL']), id: id.optional(), name: z.string().trim().min(1).max(200) }).strict()
export const previewReleaseSchema = revisionSchema.extend({ recipient: recipientSchema })
export const releaseTaskSchema = previewReleaseSchema.extend({ operationId: z.string().min(8).max(100), previewToken: z.string().regex(/^[a-f0-9]{64}$/) })
export const deliverySchema = z.object({
  operationId: z.string().min(8).max(100), method: z.enum(['MANUAL', 'EXPORT', 'EMAIL', 'WECHAT']),
  status: z.enum(['RECORDED', 'EXPORTED', 'FAILED']), note: text(2000),
}).strict()
export type TaskDraftInput = z.infer<typeof taskDraftSchema>
export type TaskFileReference = z.infer<typeof taskFileRefSchema>
export type TaskRecipient = z.infer<typeof recipientSchema>
