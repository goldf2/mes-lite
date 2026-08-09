import { z } from 'zod'

const nonnegativeNumber = z.number().finite().nonnegative()

export const bomCostRunInputSchema = z.object({
  productId: z.string().min(1, '请选择物料'),
  quantityBasis: nonnegativeNumber.positive().default(1),
  laborRatePerHour: nonnegativeNumber.default(0),
  machineRatePerHour: nonnegativeNumber.default(0),
  overheadCost: nonnegativeNumber.default(0),
})

export type BomCostRunInput = z.infer<typeof bomCostRunInputSchema>

export interface BomCostLineInput {
  lineType: string
  sourceId: string | null
  code: string | null
  name: string
  quantity: number
  unit: string
  unitCost: number
  materialCost: number
  laborHours: number
  machineHours: number
  laborCost: number
  machineCost: number
  directCost: number
  totalCost: number
  note: string | null
  sortOrder: number
}
