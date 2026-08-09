import { z } from 'zod'

const attachmentIdSchema = z.string().trim().min(1, '缺少附件 ID').max(160)
const ownerTypeSchema = z.string().trim().min(1, '缺少 ownerType').max(80)
const ownerIdSchema = z.string().trim().min(1, '缺少 ownerId').max(160)
const rotationSchema = z.preprocess(
  (value) => Number(value),
  z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
)

export const attachmentOwnerQuerySchema = z.object({
  ownerType: ownerTypeSchema,
  ownerId: ownerIdSchema,
})

export const attachmentMutationSchema = z.discriminatedUnion('action', [
  z.object({ id: attachmentIdSchema, action: z.literal('SET_COVER') }),
  z.object({ id: attachmentIdSchema, action: z.literal('SET_ROTATION'), rotation: rotationSchema }),
])

export const draftAttachmentSchema = z.object({
  ownerType: ownerTypeSchema,
  draftOwnerId: z.string().trim().startsWith('draft-').max(160),
  targetOwnerId: ownerIdSchema.optional(),
})

export type AttachmentMutationInput = z.infer<typeof attachmentMutationSchema>
export type DraftAttachmentInput = z.infer<typeof draftAttachmentSchema>

export type AttachmentUploadInput = {
  ownerType: string
  ownerId: string
  documentType: string
  uploadedBy?: string
  note?: string
  file: File
}

export function parseAttachmentUploadForm(form: FormData): AttachmentUploadInput {
  const owner = attachmentOwnerQuerySchema.parse({
    ownerType: form.get('ownerType'),
    ownerId: form.get('ownerId'),
  })
  const documentType = z.string().trim().min(1).max(80).parse(form.get('documentType') || 'ORIGINAL')
  const uploadedBy = z.string().trim().max(160).optional().parse(String(form.get('uploadedBy') || '') || undefined)
  const note = z.string().trim().max(2000).optional().parse(String(form.get('note') || '') || undefined)
  const file = form.get('file')
  if (!(file instanceof File)) throw new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: ['file'],
    message: '缺少上传文件',
  }])
  if (!file.name.trim() || file.name.length > 255) throw new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: ['file'],
    message: '文件名无效或过长',
  }])
  return { ...owner, documentType, uploadedBy, note, file }
}
