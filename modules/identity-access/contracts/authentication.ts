import { z } from 'zod'

export const loginInputSchema = z.object({ username: z.string().min(1), password: z.string().min(1) })

export const registerInputSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, '账号只能包含中文、字母、数字、下划线和短横线'),
  password: z.string().min(6, '密码至少 6 位'),
  name: z.string().trim().min(1, '姓名必填').max(50),
  phone: z.string().trim().max(30).optional(),
})

export type LoginInput = z.infer<typeof loginInputSchema>
export type RegisterInput = z.infer<typeof registerInputSchema>
