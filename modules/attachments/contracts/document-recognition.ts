import { z } from 'zod'

export const documentRecognitionInputSchema = z.object({
  attachmentId: z.string().trim().min(1),
  ownerType: z.string().trim().min(1).max(80),
  ownerId: z.string().trim().min(1).max(160),
})

export type DocumentRecognitionInput = z.infer<typeof documentRecognitionInputSchema>
