import { prisma } from '@/lib/prisma'
import type { CostObjectInput } from '../contracts/cost-object-schema'
import { costObjectInclude } from './cost-object-select'

export async function createCostObject(input: CostObjectInput) {
  return prisma.costObject.create({
    data: {
      code: input.code,
      name: input.name,
      objectType: input.objectType,
      unit: input.unit,
      costs: {
        create: {
          version: 'v1',
          materialCostPerUnit: input.materialCostPerUnit,
          laborHoursPerUnit: input.laborHoursPerUnit,
          machineHoursPerUnit: input.machineHoursPerUnit,
          directCostPerUnit: input.directCostPerUnit,
        },
      },
    },
    include: costObjectInclude,
  })
}
