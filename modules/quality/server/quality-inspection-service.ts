import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { transitionInventoryLotStatus } from '@/modules/inventory'
import type { DecideQualityInspectionInput } from '../contracts/quality-inspection-schema'
import { QualityInspectionDomainError } from '../domain/quality-inspection-errors'

export async function createProductionQualityInspection(
  tx: Prisma.TransactionClient,
  input: {
    inspectionNo: string
    lotId: string
    sourceId: string
    inspectedQty: number
  },
) {
  return tx.qualityInspection.create({
    data: {
      inspectionNo: input.inspectionNo,
      lotId: input.lotId,
      sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT',
      sourceId: input.sourceId,
      inspectedQty: input.inspectedQty,
    },
  })
}

export async function createReturnQualityInspection(
  tx: Prisma.TransactionClient,
  input: {
    inspectionNo: string
    lotId: string
    sourceId: string
    inspectedQty: number
  },
) {
  return tx.qualityInspection.create({
    data: {
      inspectionNo: input.inspectionNo,
      lotId: input.lotId,
      sourceType: 'RETURN_ORDER',
      sourceId: input.sourceId,
      inspectedQty: input.inspectedQty,
    },
  })
}

export async function decideQualityInspection(
  inspectionId: string,
  input: DecideQualityInspectionInput,
  inspectedBy: string,
) {
  return prisma.$transaction(async (tx) => {
    const inspection = await tx.qualityInspection.findUnique({
      where: { id: inspectionId },
      include: { lot: { include: { balances: true } } },
    })
    if (!inspection) throw new QualityInspectionDomainError('质量检验任务不存在', 404)
    if (inspection.status !== 'PENDING') throw new QualityInspectionDomainError('只有待检任务可以执行质量判定')
    if (Number(input.sampleQty) > Number(inspection.inspectedQty) + 0.000001) {
      throw new QualityInspectionDomainError('抽检数量不能大于本批次待检数量')
    }
    const quarantine = inspection.lot.balances.find((balance) => (
      balance.inventoryStatus === 'QUARANTINE' && Number(balance.stockQty) > 0.000001
    ))
    if (!quarantine) throw new QualityInspectionDomainError('待检批次没有可处置的待检库存')

    const toStatus = input.decision === 'PASS' ? 'AVAILABLE' : 'HOLD'
    const transition = await transitionInventoryLotStatus(tx, {
      lotId: inspection.lotId,
      fromStatus: 'QUARANTINE',
      toStatus,
      type: input.decision === 'PASS' ? 'QUALITY_RELEASE' : 'QUALITY_HOLD',
      refType: 'QUALITY_INSPECTION',
      refId: inspection.id,
      idempotencyKey: `QUALITY_INSPECTION:${inspection.id}:${input.decision}`,
      note: input.note,
      createdBy: inspectedBy,
    })
    const updated = await tx.qualityInspection.update({
      where: { id: inspection.id },
      data: {
        status: 'COMPLETED',
        result: input.decision,
        sampleQty: input.sampleQty,
        goodQty: input.goodQty,
        badQty: input.badQty,
        inspector: inspectedBy,
        checkedAt: new Date(),
        note: input.note,
      },
      include: { lot: { include: { balances: true } } },
    })
    return { before: inspection, updated, transition }
  })
}
