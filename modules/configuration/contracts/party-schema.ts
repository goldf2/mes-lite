import { z } from 'zod'

export const partyInputSchema = z.object({
  name: z.string().trim().min(1, '名称必填'),
  contact: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
})

export const partyUpdateSchema = partyInputSchema.extend({
  id: z.string().trim().min(1, 'ID 必填'),
})

export const partyIdSchema = z.string().trim().min(1, '缺少 ID')

export type PartyInput = z.infer<typeof partyInputSchema>
