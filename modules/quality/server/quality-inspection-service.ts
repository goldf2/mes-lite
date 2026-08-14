import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertInventoryLocationDataScope, unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { scrapInventoryLotQuantity, transitionInventoryLotStatus } from '@/modules/inventory'
import type { DecideQualityInspectionInput, DisposeQualityInspectionInput } from '../contracts/quality-inspection-schema'
import type { QualityInspectionSourceType } from '../contracts/quality-inspection-standard-schema'
import { QualityInspectionDomainError } from '../domain/quality-inspection-errors'
import { calculateSuggestedSampleQty } from '../domain/quality-sampling-rules'

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

async function qualityStandardSnapshot(
  tx: Prisma.TransactionClient,
  input: { lotId: string; sourceType: QualityInspectionSourceType; inspectedQty: number },
) {
  const lot = await tx.inventoryLot.findUnique({ where: { id: input.lotId }, select: { materialId: true } })
  if (!lot) throw new QualityInspectionDomainError('待检批次不存在', 404)
  const standard = await tx.qualityInspectionStandard.findFirst({
    where: { materialId: lot.materialId, sourceType: input.sourceType, status: 'RELEASED' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { releasedAt: 'desc' },
  })
  if (!standard) return { suggestedSampleQty: 0 }
  return {
    standardId: standard.id,
    standardCodeSnapshot: standard.code,
    standardVersionSnapshot: standard.version,
    standardNameSnapshot: standard.name,
    samplingModeSnapshot: standard.samplingMode,
    samplingValueSnapshot: standard.sampleValue,
    minSampleQtySnapshot: standard.minSampleQty,
    maxSampleQtySnapshot: standard.maxSampleQty,
    suggestedSampleQty: calculateSuggestedSampleQty(input.inspectedQty, {
      mode: standard.samplingMode as 'FULL' | 'FIXED' | 'PERCENTAGE',
      value: Number(standard.sampleValue), min: standard.minSampleQty == null ? null : Number(standard.minSampleQty), max: standard.maxSampleQty == null ? null : Number(standard.maxSampleQty),
    }),
    checkItems: { create: standard.items.map((item) => ({
      standardItemId: item.id, name: item.name, method: item.method,
      acceptanceCriteria: item.acceptanceCriteria, sortOrder: item.sortOrder,
    })) },
  }
}

export async function hasReleasedQualityInspectionStandard(
  tx: Prisma.TransactionClient,
  input: { materialId: string; sourceType: QualityInspectionSourceType },
) {
  return Boolean(await tx.qualityInspectionStandard.findFirst({
    where: { materialId: input.materialId, sourceType: input.sourceType, status: 'RELEASED' },
    select: { id: true },
  }))
}

function followUpStandardSnapshot(inspection: {
  standardId: string | null
  standardCodeSnapshot: string | null
  standardVersionSnapshot: number | null
  standardNameSnapshot: string | null
  samplingModeSnapshot: string | null
  samplingValueSnapshot: number | null
  minSampleQtySnapshot: number | null
  maxSampleQtySnapshot: number | null
  checkItems: Array<{ standardItemId: string | null; name: string; method: string; acceptanceCriteria: string; sortOrder: number }>
}, inspectedQty: number) {
  if (!inspection.standardId || !inspection.samplingModeSnapshot) return { suggestedSampleQty: 0 }
  return {
    standardId: inspection.standardId,
    standardCodeSnapshot: inspection.standardCodeSnapshot,
    standardVersionSnapshot: inspection.standardVersionSnapshot,
    standardNameSnapshot: inspection.standardNameSnapshot,
    samplingModeSnapshot: inspection.samplingModeSnapshot,
    samplingValueSnapshot: inspection.samplingValueSnapshot,
    minSampleQtySnapshot: inspection.minSampleQtySnapshot,
    maxSampleQtySnapshot: inspection.maxSampleQtySnapshot,
    suggestedSampleQty: calculateSuggestedSampleQty(inspectedQty, {
      mode: inspection.samplingModeSnapshot as 'FULL' | 'FIXED' | 'PERCENTAGE',
      value: Number(inspection.samplingValueSnapshot || 0), min: inspection.minSampleQtySnapshot, max: inspection.maxSampleQtySnapshot,
    }),
    checkItems: { create: inspection.checkItems.map((item) => ({
      standardItemId: item.standardItemId, name: item.name, method: item.method,
      acceptanceCriteria: item.acceptanceCriteria, sortOrder: item.sortOrder,
    })) },
  }
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
  const snapshot = await qualityStandardSnapshot(tx, { lotId: input.lotId, sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT', inspectedQty: input.inspectedQty })
  return tx.qualityInspection.create({
    data: {
      inspectionNo: input.inspectionNo,
      lotId: input.lotId,
      sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT',
      sourceId: input.sourceId,
      inspectedQty: input.inspectedQty,
      ...snapshot,
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
  const snapshot = await qualityStandardSnapshot(tx, { lotId: input.lotId, sourceType: 'RETURN_ORDER', inspectedQty: input.inspectedQty })
  return tx.qualityInspection.create({
    data: {
      inspectionNo: input.inspectionNo,
      lotId: input.lotId,
      sourceType: 'RETURN_ORDER',
      sourceId: input.sourceId,
      inspectedQty: input.inspectedQty,
      ...snapshot,
    },
  })
}

export async function createMaterialInQualityInspection(
  tx: Prisma.TransactionClient,
  input: {
    inspectionNo: string
    lotId: string
    sourceId: string
    inspectedQty: number
  },
) {
  const snapshot = await qualityStandardSnapshot(tx, { lotId: input.lotId, sourceType: 'MATERIAL_IN', inspectedQty: input.inspectedQty })
  if (!snapshot.standardId) throw new QualityInspectionDomainError('来料收货时未找到已发布检验标准，不能建立待检任务')
  return tx.qualityInspection.create({
    data: {
      inspectionNo: input.inspectionNo,
      lotId: input.lotId,
      sourceType: 'MATERIAL_IN',
      sourceId: input.sourceId,
      inspectedQty: input.inspectedQty,
      ...snapshot,
    },
  })
}

export async function prepareMaterialInQualityReversal(
  tx: Prisma.TransactionClient,
  input: { lotId: string; materialInId: string; reason: string; reversedBy: string },
) {
  const inspections = await tx.qualityInspection.findMany({
    where: { lotId: input.lotId, sourceType: 'MATERIAL_IN', sourceId: input.materialInId },
    include: { dispositions: true },
    orderBy: [{ round: 'desc' }, { createdAt: 'desc' }],
  })
  if (inspections.length === 0) return { inventoryStatus: 'AVAILABLE' as const, cancelledInspectionId: null }
  const current = inspections[0]
  if (inspections.length === 1 && current.round === 1 && current.status === 'PENDING' && current.dispositions.length === 0) {
    await tx.qualityInspection.update({
      where: { id: current.id },
      data: {
        status: 'CANCELLED', result: 'CANCELLED', inspector: input.reversedBy, checkedAt: new Date(),
        note: current.note ? `${current.note}\n来料红冲取消：${input.reason}` : `来料红冲取消：${input.reason}`,
      },
    })
    return { inventoryStatus: 'QUARANTINE' as const, cancelledInspectionId: current.id }
  }
  if (inspections.length === 1 && current.status === 'COMPLETED' && current.result === 'PASS') {
    return { inventoryStatus: 'AVAILABLE' as const, cancelledInspectionId: null }
  }
  throw new QualityInspectionDomainError('来料批次已完成不合格判定或进入后续质量处置，不能直接红冲；请先按质量流程处理')
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
      include: { lot: { include: { balances: true } }, checkItems: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!inspection) throw new QualityInspectionDomainError('质量检验任务不存在', 404)
    assertInventoryLocationDataScope(scope, inspection.lot.balances
      .filter((balance) => Number(balance.stockQty) > tolerance)
      .map((balance) => balance.locationId))
    if (inspection.status !== 'PENDING') throw new QualityInspectionDomainError('只有待检任务可以执行质量判定')
    if (Number(input.sampleQty) > Number(inspection.inspectedQty) + 0.000001) {
      throw new QualityInspectionDomainError('抽检数量不能大于本批次待检数量')
    }
    if (Number(input.sampleQty) + tolerance < Number(inspection.suggestedSampleQty)) {
      throw new QualityInspectionDomainError(`抽检数量不能低于检验标准建议数量 ${inspection.suggestedSampleQty}`)
    }
    const submittedItems = input.itemResults || []
    if (inspection.checkItems.length > 0) {
      const submittedById = new Map(submittedItems.map((item) => [item.itemId, item]))
      if (submittedById.size !== inspection.checkItems.length || inspection.checkItems.some((item) => !submittedById.has(item.id))) {
        throw new QualityInspectionDomainError('必须逐项提交当前检验标准的全部项目结果')
      }
      const hasFailedItem = inspection.checkItems.some((item) => submittedById.get(item.id)?.result === 'FAIL')
      if (input.decision === 'PASS' && hasFailedItem) throw new QualityInspectionDomainError('整批合格时所有检验项目必须合格')
      if (input.decision !== 'PASS' && !hasFailedItem) throw new QualityInspectionDomainError('不合格或部分判定必须至少有一个检验项目不合格')
      const checkedAt = new Date()
      for (const item of inspection.checkItems) {
        const result = submittedById.get(item.id)!
        await tx.qualityInspectionCheckItem.update({ where: { id: item.id }, data: {
          result: result.result, measuredValue: result.measuredValue?.trim() || null,
          note: result.note?.trim() || null, checkedAt,
        } })
      }
    } else if (submittedItems.length > 0) {
      throw new QualityInspectionDomainError('该检验任务没有标准项目，不能提交未知项目结果')
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
      include: { lot: { include: { balances: true } }, dispositions: true, checkItems: { orderBy: { sortOrder: 'asc' } } },
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
      include: { lot: { include: { balances: true } }, checkItems: { orderBy: { sortOrder: 'asc' } } },
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
          ...followUpStandardSnapshot(inspection, input.stockQty),
        },
      })
    }
    return { before: inspection, disposition, followUpInspection, duplicate: false }
  })
}
