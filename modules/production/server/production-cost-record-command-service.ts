import { createAuditLog, type AuditContext } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import type { ProductionCostRecordInput } from '../contracts/production-cost-record-schema'
import { productionCostRecordInclude } from './production-cost-record-select'

export async function createProductionCostRecord(
  input: ProductionCostRecordInput,
  createdBy: string,
  auditContext?: AuditContext,
) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.costRecord.create({
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
    if (auditContext) await createAuditLog(tx, auditContext, {
      action: 'CREATE',
      entityType: 'COST_RECORD',
      entityId: record.id,
      entityLabel: `${record.costType} ${record.category}`,
      afterData: record,
    })
    return record
  })
}
