import { prisma } from '@/lib/prisma'
import type { ProductionCostRecordInput } from '../contracts/production-cost-record-schema'
import { productionCostRecordInclude } from './production-cost-record-select'

export async function createProductionCostRecord(input: ProductionCostRecordInput, createdBy: string) {
  return prisma.costRecord.create({
    data: {
      orderId: input.orderId ?? null,
      costType: input.costType,
      category: input.category,
      amount: input.amount,
      description: input.description,
      date: new Date(input.date),
      createdBy,
    },
    include: productionCostRecordInclude,
  })
}
