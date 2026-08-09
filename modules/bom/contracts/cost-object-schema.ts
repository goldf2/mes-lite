import { z } from 'zod'

const nonnegativeNumber = z.number().finite().nonnegative()

export const costObjectInputSchema = z.object({
  code: z.string().trim().min(1, '成本对象编码必填'),
  name: z.string().trim().min(1, '成本对象名称必填'),
  objectType: z.string().trim().min(1).default('MANUAL'),
  unit: z.string().trim().min(1).default('件'),
  materialCostPerUnit: nonnegativeNumber.default(0),
  laborHoursPerUnit: nonnegativeNumber.default(0),
  machineHoursPerUnit: nonnegativeNumber.default(0),
  directCostPerUnit: nonnegativeNumber.default(0),
})

export type CostObjectInput = z.infer<typeof costObjectInputSchema>
