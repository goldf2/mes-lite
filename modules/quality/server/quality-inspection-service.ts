import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { scrapInventoryLotQuantity, transitionInventoryLotStatus } from '@/modules/inventory'
import type { DecideQualityInspectionInput, DisposeQualityInspectionInput } from '../contracts/quality-inspection-schema'
import { QualityInspectionDomainError } from '../domain/quality-inspection-errors'

const tolerance = 0.000001

function dispositionNo(inspectionNo: string, action: string, operationId: string) {
  const suffix = operationId.replace(/[^a-zA-Z0-9]/g, '').slice(-12)
  return `QD-${inspectionNo}-${action}-${suffix}`
}

async function createDisposition(
  tx: Prisma.TransactionClient,
  input: {
    inspectionId: string
    inspectionNo: string
    lotId: string
    operationId: string
    action: string
    sourceStatus: string | null
    targetStatus: string | null
    stockQty: number
    valuationQty: number
    costAmount: number
    reason: string
    performedBy: string
  },
) {
  return tx.qualityDisposition.create({
    data: {
      dispositionNo: dispositionNo(input.inspectionNo, input.action, input.operationId),
      operationId: input.operationId,
      inspectionId: input.inspectionId,
      lotId: input.lotId,
      action: input.action,
      sourceStatus: input.sourceStatus,
      targetStatus: input.targetStatus,
      stockQty: input.stockQty,
      valuationQty: input.valuationQty,
      costAmount: input.costAmount,
      reason: input.reason,
      performedBy: input.performedBy,
    },
  })
}

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
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return prisma.$transaction(async (tx) => {
    const inspection = await tx.qualityInspection.findUnique({
      where: { id: inspectionId },
      include: { lot: { include: { balances: true } } },
    })
    if (!inspection) throw new QualityInspectionDomainError('质量检验任务不存在', 404)
    assertInventoryLocationDataScope(scope, inspection.lot.balances
      .filter((balance) => Number(balance.stockQty) > tolerance)
      .map((balance) => balance.locationId))
    if (inspection.status !== 'PENDING') throw new QualityInspectionDomainError('只有待检任务可以执行质量判定')
    if (Number(input.sampleQty) > Number(inspection.inspectedQty) + 0.000001) {
      throw new QualityInspectionDomainError('抽检数量不能大于本批次待检数量')
    }
    const quarantine = inspection.lot.balances.find((balance) => (
      balance.inventoryStatus === 'QUARANTINE' && Number(balance.stockQty) > tolerance
    ))
    if (!quarantine) throw new QualityInspectionDomainError('待检批次没有可处置的待检库存')
    const quarantineQty = Number(quarantine.stockQty)
    if (Math.abs(quarantineQty - Number(inspection.inspectedQty)) > tolerance) {
      throw new QualityInspectionDomainError('本轮待检数量与当前批次待检余额不一致，请先核对批次处置记录')
    }

    const transitions = []
    if (input.decision === 'PARTIAL') {
      const releaseQty = Number(input.releaseQty)
      const holdQty = Number(input.holdQty)
      if (Math.abs(releaseQty + holdQty - quarantineQty) > tolerance) {
        throw new QualityInspectionDomainError('部分判定的放行数量与冻结数量之和必须等于本轮待检数量')
      }
      const released = await transitionInventoryLotStatus(tx, {
        lotId: inspection.lotId,
        fromStatus: 'QUARANTINE',
        toStatus: 'AVAILABLE',
        stockQty: releaseQty,
        type: 'QUALITY_PARTIAL_RELEASE',
        refType: 'QUALITY_INSPECTION',
        refId: inspection.id,
        idempotencyKey: `QUALITY_INSPECTION:${inspection.id}:PARTIAL:RELEASE`,
        note: input.note,
        createdBy: inspectedBy,
      })
      transitions.push(released)
      await createDisposition(tx, {
        inspectionId: inspection.id,
        inspectionNo: inspection.inspectionNo,
        lotId: inspection.lotId,
        operationId: `DECISION:${inspection.id}:RELEASE`,
        action: 'DECISION_RELEASE',
        sourceStatus: 'QUARANTINE',
        targetStatus: 'AVAILABLE',
        stockQty: Number(released.transaction.stockQty),
        valuationQty: Number(released.transaction.valuationQty),
        costAmount: Number(released.transaction.costAmount),
        reason: input.note,
        performedBy: inspectedBy,
      })
      const held = await transitionInventoryLotStatus(tx, {
        lotId: inspection.lotId,
        fromStatus: 'QUARANTINE',
        toStatus: 'HOLD',
        stockQty: holdQty,
        type: 'QUALITY_PARTIAL_HOLD',
        refType: 'QUALITY_INSPECTION',
        refId: inspection.id,
        idempotencyKey: `QUALITY_INSPECTION:${inspection.id}:PARTIAL:HOLD`,
        note: input.note,
        createdBy: inspectedBy,
      })
      transitions.push(held)
      await createDisposition(tx, {
        inspectionId: inspection.id,
        inspectionNo: inspection.inspectionNo,
        lotId: inspection.lotId,
        operationId: `DECISION:${inspection.id}:HOLD`,
        action: 'DECISION_HOLD',
        sourceStatus: 'QUARANTINE',
        targetStatus: 'HOLD',
        stockQty: Number(held.transaction.stockQty),
        valuationQty: Number(held.transaction.valuationQty),
        costAmount: Number(held.transaction.costAmount),
        reason: input.note,
        performedBy: inspectedBy,
      })
    } else {
      const toStatus = input.decision === 'PASS' ? 'AVAILABLE' : 'HOLD'
      const action = input.decision === 'PASS' ? 'DECISION_RELEASE' : 'DECISION_HOLD'
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
      transitions.push(transition)
      await createDisposition(tx, {
        inspectionId: inspection.id,
        inspectionNo: inspection.inspectionNo,
        lotId: inspection.lotId,
        operationId: `DECISION:${inspection.id}:${input.decision}`,
        action,
        sourceStatus: 'QUARANTINE',
        targetStatus: toStatus,
        stockQty: Number(transition.transaction.stockQty),
        valuationQty: Number(transition.transaction.valuationQty),
        costAmount: Number(transition.transaction.costAmount),
        reason: input.note,
        performedBy: inspectedBy,
      })
    }
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
      include: { lot: { include: { balances: true } }, dispositions: true },
    })
    return { before: inspection, updated, transitions }
  })
}

export async function disposeQualityInspection(
  inspectionId: string,
  input: DisposeQualityInspectionInput,
  performedBy: string,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.qualityDisposition.findUnique({
      where: { operationId: input.operationId },
      include: { followUpInspection: true },
    })
    if (duplicate) return { disposition: duplicate, followUpInspection: duplicate.followUpInspection, duplicate: true }

    const inspection = await tx.qualityInspection.findUnique({
      where: { id: inspectionId },
      include: { lot: { include: { balances: true } } },
    })
    if (!inspection) throw new QualityInspectionDomainError('质量检验任务不存在', 404)
    assertInventoryLocationDataScope(scope, inspection.lot.balances
      .filter((balance) => Number(balance.stockQty) > tolerance)
      .map((balance) => balance.locationId))
    if (inspection.status !== 'COMPLETED') throw new QualityInspectionDomainError('质量判定完成后才能执行后续处置')

    const sourceStatus = input.action === 'REWORK_COMPLETE' ? 'REWORK' : 'HOLD'
    const sourceBalance = inspection.lot.balances.find((balance) => (
      balance.inventoryStatus === sourceStatus && Number(balance.stockQty) > tolerance
    ))
    if (!sourceBalance || Number(sourceBalance.stockQty) + tolerance < input.stockQty) {
      throw new QualityInspectionDomainError(`当前批次${sourceStatus === 'REWORK' ? '返工中' : '冻结'}数量不足，不能执行本次处置`)
    }

    let targetStatus: 'AVAILABLE' | 'QUARANTINE' | 'REWORK' | null = null
    if (input.action === 'REINSPECT' || input.action === 'REWORK_COMPLETE') targetStatus = 'QUARANTINE'
    if (input.action === 'CONCESSION' || input.action === 'UNFREEZE') targetStatus = 'AVAILABLE'
    if (input.action === 'REWORK_START') targetStatus = 'REWORK'

    const base = {
      lotId: inspection.lotId,
      fromStatus: sourceStatus as 'HOLD' | 'REWORK',
      stockQty: input.stockQty,
      refType: 'QUALITY_DISPOSITION',
      refId: input.operationId,
      idempotencyKey: `QUALITY_DISPOSITION:${input.operationId}`,
      note: input.reason,
      createdBy: performedBy,
    }
    const movement = input.action === 'SCRAP'
      ? await scrapInventoryLotQuantity(tx, base)
      : await transitionInventoryLotStatus(tx, {
        ...base,
        toStatus: targetStatus!,
        type: `QUALITY_${input.action}`,
      })
    const transaction = movement.transaction
    const disposition = await createDisposition(tx, {
      inspectionId: inspection.id,
      inspectionNo: inspection.inspectionNo,
      lotId: inspection.lotId,
      operationId: input.operationId,
      action: input.action,
      sourceStatus,
      targetStatus,
      stockQty: Math.abs(Number(transaction.stockQty)),
      valuationQty: Math.abs(Number(transaction.valuationQty)),
      costAmount: Math.abs(Number(transaction.costAmount)),
      reason: input.reason,
      performedBy,
    })

    let followUpInspection = null
    if (input.action === 'REINSPECT' || input.action === 'REWORK_COMPLETE') {
      followUpInspection = await tx.qualityInspection.create({
        data: {
          inspectionNo: `${inspection.inspectionNo}-R${inspection.round + 1}-${input.operationId.slice(0, 8)}`,
          lotId: inspection.lotId,
          sourceType: inspection.sourceType,
          sourceId: inspection.sourceId,
          round: inspection.round + 1,
          parentInspectionId: inspection.id,
          requestedByDispositionId: disposition.id,
          inspectedQty: input.stockQty,
          note: input.reason,
        },
      })
    }
    return { before: inspection, disposition, followUpInspection, duplicate: false }
  })
}
