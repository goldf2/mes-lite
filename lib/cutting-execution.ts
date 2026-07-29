import { Prisma } from '@prisma/client'
import {
  issueReservedCuttingInventory,
  receiveCuttingRemnant,
  reverseCuttingInventoryIssue,
  reverseCuttingRemnantReceipt,
} from './cutting-inventory'
import {
  createProductionLotsForCuttingTask,
  ensureCuttingTaskLotsReversible,
  refreshProductionOrderFromLots,
} from './production-lot'

const lengthToleranceMm = 1
const roundValue = (value: number) => Number(value.toFixed(6))

export type CuttingTaskActor = {
  id?: string | null
  name?: string | null
}

export type CompleteCuttingTaskInput = {
  clientRequestId: string
  sources: Array<{
    planSourceId: string
    actualSourceLengthMm: number
    actualRemainingLengthMm: number
    actualKerfLossMm: number
    actualFixedLossMm: number
    actualOtherLossMm: number
    disposition: 'REUSABLE_REMNANT' | 'SCRAP'
    outputs: Array<{
      cuttingDemandId: string
      goodQty: number
      badQty: number
      scrapQty: number
      badReason?: string | null
    }>
  }>
}

function requireNonnegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}必须为非负数`)
  return Number(value)
}

function sourceStatusAfterConsume(entity: {
  availableQty: number
  reservedQty: number
  isRemnant: boolean
}) {
  if (entity.availableQty > 0) return entity.isRemnant ? 'REMNANT' : 'AVAILABLE'
  if (entity.reservedQty > 0) return 'RESERVED'
  return 'CONSUMED'
}

function sourceStatusAfterRestore(entity: {
  availableQty: number
  reservedQty: number
  isRemnant: boolean
}) {
  if (entity.availableQty > 0) return entity.isRemnant ? 'REMNANT' : 'AVAILABLE'
  if (entity.reservedQty > 0) return 'RESERVED'
  return entity.isRemnant ? 'REMNANT' : 'AVAILABLE'
}

export async function releaseCuttingTask(
  tx: Prisma.TransactionClient,
  input: {
    cuttingPlanId: string
    clientRequestId: string
    device?: string | null
    shift?: string | null
    note?: string | null
  },
) {
  const existing = await tx.cuttingTask.findUnique({
    where: { clientRequestId: input.clientRequestId },
    include: { cuttingPlan: true, sources: { include: { outputs: true } } },
  })
  if (existing) return existing

  const plan = await tx.cuttingPlan.findUnique({
    where: { id: input.cuttingPlanId },
    include: {
      tasks: { where: { status: { in: ['READY', 'RUNNING', 'COMPLETED'] } }, select: { taskNo: true } },
    },
  })
  if (!plan) throw new Error('排样方案不存在')
  if (plan.status !== 'CONFIRMED') throw new Error('只有已确认的排样方案可以下发锯切任务')
  if (!plan.rawMaterialId || Number(plan.reservedStockQty) <= 0) {
    throw new Error('该排样方案没有完整的汇总库存预留，请取消后重新排样')
  }
  if (plan.tasks.length > 0) throw new Error(`排样方案已有未冲销任务 ${plan.tasks[0].taskNo}`)

  const now = new Date()
  const dateText = now.toISOString().slice(0, 10).replace(/-/g, '')
  const dailyCount = await tx.cuttingTask.count({
    where: { createdAt: { gte: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) } },
  })
  return tx.cuttingTask.create({
    data: {
      taskNo: `CT-${dateText}-${String(dailyCount + 1).padStart(3, '0')}`,
      clientRequestId: input.clientRequestId,
      cuttingPlanId: plan.id,
      rawMaterialId: plan.rawMaterialId,
      status: 'READY',
      device: input.device?.trim() || null,
      shift: input.shift?.trim() || null,
      note: input.note?.trim() || null,
    },
    include: { cuttingPlan: true, sources: { include: { outputs: true } } },
  })
}

export async function startCuttingTask(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    actor: CuttingTaskActor
  },
) {
  const task = await tx.cuttingTask.findUnique({ where: { id: input.taskId } })
  if (!task) throw new Error('锯切任务不存在')
  if (task.status === 'RUNNING') return task
  if (task.status !== 'READY') throw new Error('只有待开工的锯切任务可以开工')
  return tx.cuttingTask.update({
    where: { id: task.id },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      startedBy: input.actor.name || null,
      startedById: input.actor.id || null,
    },
  })
}

export async function completeCuttingTask(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    completion: CompleteCuttingTaskInput
    actor: CuttingTaskActor
  },
) {
  const duplicate = await tx.cuttingTask.findUnique({
    where: { completeRequestId: input.completion.clientRequestId },
    include: {
      cuttingPlan: true,
      sources: { include: { outputs: true, remnantEntity: true } },
    },
  })
  if (duplicate) return duplicate

  const task = await tx.cuttingTask.findUnique({
    where: { id: input.taskId },
    include: {
      cuttingPlan: {
        include: {
          sources: {
            include: {
              entity: true,
              cuts: {
                include: {
                  planDemand: { include: { demand: true } },
                },
                orderBy: { sequence: 'asc' },
              },
            },
            orderBy: [{ entity: { entityNo: 'asc' } }, { sourceUnitIndex: 'asc' }],
          },
        },
      },
    },
  })
  if (!task) throw new Error('锯切任务不存在')
  if (!['READY', 'RUNNING'].includes(task.status)) throw new Error('只有待开工或加工中的锯切任务可以完工')
  const plan = task.cuttingPlan
  if (plan.status !== 'CONFIRMED') throw new Error('排样方案状态已变化，不能提交锯切实绩')
  if (input.completion.sources.length !== plan.sources.length) throw new Error('必须提交排样方案内每一根原料的锯切实绩')
  const inputSourceIds = input.completion.sources.map((item) => item.planSourceId)
  if (new Set(inputSourceIds).size !== inputSourceIds.length) throw new Error('同一排样原料不能重复提交')
  const inputBySourceId = new Map(input.completion.sources.map((item) => [item.planSourceId, item]))
  const config = await tx.manufacturingConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', allowNegativeStock: false },
    update: {},
  })
  const minReusableLengthMm = Number(config.minReusableRemnantLengthMm ?? 0)

  const validatedSources = plan.sources.map((planSource) => {
    const actual = inputBySourceId.get(planSource.id)
    if (!actual) throw new Error(`缺少第 ${planSource.sourceUnitIndex} 根原料的实绩`)
    const actualSourceLengthMm = requireNonnegative(actual.actualSourceLengthMm, '实际原料长度')
    const actualRemainingLengthMm = requireNonnegative(actual.actualRemainingLengthMm, '实际剩余长度')
    const actualKerfLossMm = requireNonnegative(actual.actualKerfLossMm, '实际锯缝损耗')
    const actualFixedLossMm = requireNonnegative(actual.actualFixedLossMm, '实际首尾及夹持损耗')
    const actualOtherLossMm = requireNonnegative(actual.actualOtherLossMm, '实际其他损耗')
    if (actualSourceLengthMm <= 0) throw new Error('实际原料长度必须大于 0')
    if (Math.abs(actualSourceLengthMm - planSource.sourceLengthMm) > lengthToleranceMm) {
      throw new Error(`实体 ${planSource.entity.entityNo} 的实际原料长度与库存实测长度相差超过 ${lengthToleranceMm} mm`)
    }
    if (actual.disposition === 'REUSABLE_REMNANT') {
      if (actualRemainingLengthMm <= 0) throw new Error('可复用余料的实际剩余长度必须大于 0')
      if (actualRemainingLengthMm + lengthToleranceMm < minReusableLengthMm) {
        throw new Error(`余料长度低于当前可复用阈值 ${minReusableLengthMm} mm`)
      }
    }

    const plannedByDemand = new Map<string, { plannedQty: number; pieceLengthMm: number }>()
    for (const cut of planSource.cuts) {
      const existing = plannedByDemand.get(cut.planDemand.demandId)
      if (existing) existing.plannedQty += cut.plannedQty
      else plannedByDemand.set(cut.planDemand.demandId, {
        plannedQty: cut.plannedQty,
        pieceLengthMm: cut.pieceLengthMm,
      })
    }
    const actualDemandIds = actual.outputs.map((item) => item.cuttingDemandId)
    if (new Set(actualDemandIds).size !== actualDemandIds.length) throw new Error('同一根原料的同一需求实绩不能重复')
    if (actual.outputs.length !== plannedByDemand.size) throw new Error('必须填写每条计划切割需求的产出实绩')

    let productLengthMm = 0
    const outputs = actual.outputs.map((output) => {
      const planned = plannedByDemand.get(output.cuttingDemandId)
      if (!planned) throw new Error('实绩包含未在该根原料上排样的切割需求')
      if (
        !Number.isInteger(output.goodQty) || output.goodQty < 0
        || !Number.isInteger(output.badQty) || output.badQty < 0
        || !Number.isInteger(output.scrapQty) || output.scrapQty < 0
      ) {
        throw new Error('合格、不良和报废数量必须为非负整数')
      }
      const actualQty = output.goodQty + output.badQty + output.scrapQty
      if (actualQty !== planned.plannedQty) {
        throw new Error(`切割实绩数量 ${actualQty} 与计划数量 ${planned.plannedQty} 不一致`)
      }
      productLengthMm += actualQty * planned.pieceLengthMm
      return { ...output, plannedQty: planned.plannedQty, pieceLengthMm: planned.pieceLengthMm }
    })
    const accountedLengthMm = roundValue(
      productLengthMm
      + actualKerfLossMm
      + actualFixedLossMm
      + actualOtherLossMm
      + actualRemainingLengthMm,
    )
    if (Math.abs(actualSourceLengthMm - accountedLengthMm) > lengthToleranceMm) {
      throw new Error(
        `实体 ${planSource.entity.entityNo} 长度不平衡：原料 ${actualSourceLengthMm} mm，产出与损耗合计 ${accountedLengthMm} mm`,
      )
    }
    return {
      planSource,
      actual: {
        ...actual,
        actualSourceLengthMm,
        actualRemainingLengthMm,
        actualKerfLossMm,
        actualFixedLossMm,
        actualOtherLossMm,
      },
      outputs,
    }
  })

  const issue = await issueReservedCuttingInventory(tx, {
    taskId: task.id,
    taskNo: task.taskNo,
    materialId: task.rawMaterialId,
    stockQty: Number(plan.reservedStockQty),
    reservedValuationQty: Number(plan.reservedValuationQty),
    actor: input.actor,
  })
  const totalSourceLengthMm = validatedSources.reduce((sum, item) => sum + item.actual.actualSourceLengthMm, 0)
  let remnantStockQty = 0
  let remnantValuationQty = 0
  let remnantCostAmount = 0
  const completedByDemand = new Map<string, number>()

  for (let index = 0; index < validatedSources.length; index += 1) {
    const item = validatedSources[index]
    const sourceEntity = await tx.profileStockEntity.findUnique({ where: { id: item.planSource.entityId } })
    if (!sourceEntity) throw new Error('锯切来源实体不存在')
    if (sourceEntity.reservedQty <= 0) throw new Error(`实体 ${sourceEntity.entityNo} 没有可耗用的排样占用`)
    const afterReservedQty = sourceEntity.reservedQty - 1
    const afterConsumedQty = sourceEntity.consumedQty + 1
    const afterStatus = sourceStatusAfterConsume({
      availableQty: sourceEntity.availableQty,
      reservedQty: afterReservedQty,
      isRemnant: sourceEntity.isRemnant,
    })
    await tx.profileStockEntity.update({
      where: { id: sourceEntity.id },
      data: {
        reservedQty: afterReservedQty,
        consumedQty: afterConsumedQty,
        status: afterStatus,
      },
    })
    const sourceMovement = await tx.profileStockMovement.create({
      data: {
        entityId: sourceEntity.id,
        movementType: 'CONSUME_FOR_CUTTING',
        quantityDelta: 0,
        beforeAvailableQty: sourceEntity.availableQty,
        afterAvailableQty: sourceEntity.availableQty,
        beforeReservedQty: sourceEntity.reservedQty,
        afterReservedQty,
        beforeConsumedQty: sourceEntity.consumedQty,
        afterConsumedQty,
        beforeScrappedQty: sourceEntity.scrappedQty,
        afterScrappedQty: sourceEntity.scrappedQty,
        beforeStatus: sourceEntity.status,
        afterStatus,
        lengthBeforeMm: sourceEntity.actualLengthMm,
        lengthAfterMm: sourceEntity.actualLengthMm,
        sourceType: 'CUTTING_TASK',
        sourceId: task.id,
        idempotencyKey: `CUTTING_TASK:${task.id}:SOURCE:${item.planSource.id}:CONSUME`,
        operatorId: input.actor.id || null,
        operatorName: input.actor.name || null,
        note: `锯切任务 ${task.taskNo} 耗用第 ${item.planSource.sourceUnitIndex} 根`,
      },
    })
    const taskSource = await tx.cuttingTaskSource.create({
      data: {
        taskId: task.id,
        planSourceId: item.planSource.id,
        sourceEntityId: sourceEntity.id,
        sourceUnitIndex: item.planSource.sourceUnitIndex,
        actualSourceLengthMm: item.actual.actualSourceLengthMm,
        actualRemainingLengthMm: item.actual.actualRemainingLengthMm,
        actualKerfLossMm: item.actual.actualKerfLossMm,
        actualFixedLossMm: item.actual.actualFixedLossMm,
        actualOtherLossMm: item.actual.actualOtherLossMm,
        disposition: item.actual.disposition,
      },
    })
    for (const output of item.outputs) {
      await tx.cuttingTaskOutput.create({
        data: {
          taskSourceId: taskSource.id,
          cuttingDemandId: output.cuttingDemandId,
          plannedQty: output.plannedQty,
          pieceLengthMm: output.pieceLengthMm,
          goodQty: output.goodQty,
          badQty: output.badQty,
          scrapQty: output.scrapQty,
          badReason: output.badReason?.trim() || null,
        },
      })
      completedByDemand.set(
        output.cuttingDemandId,
        (completedByDemand.get(output.cuttingDemandId) || 0) + output.goodQty,
      )
    }

    if (item.actual.disposition === 'REUSABLE_REMNANT') {
      const lengthRatio = totalSourceLengthMm > 0
        ? item.actual.actualRemainingLengthMm / totalSourceLengthMm
        : 0
      const remnantEntity = await tx.profileStockEntity.create({
        data: {
          entityNo: `RM-${task.taskNo}-${String(index + 1).padStart(3, '0')}`,
          materialId: sourceEntity.materialId,
          materialInId: sourceEntity.materialInId,
          receiptLineId: sourceEntity.receiptLineId,
          supplierId: sourceEntity.supplierId,
          parentEntityId: sourceEntity.id,
          entityType: 'SINGLE',
          actualLengthMm: item.actual.actualRemainingLengthMm,
          originalLengthMm: item.actual.actualRemainingLengthMm,
          quantity: 1,
          availableQty: 1,
          totalWeightKg: sourceEntity.unitWeightKg === null
            ? null
            : roundValue(Number(sourceEntity.unitWeightKg) * item.actual.actualRemainingLengthMm / item.actual.actualSourceLengthMm),
          unitWeightKg: sourceEntity.unitWeightKg === null
            ? null
            : roundValue(Number(sourceEntity.unitWeightKg) * item.actual.actualRemainingLengthMm / item.actual.actualSourceLengthMm),
          batchNo: sourceEntity.batchNo,
          location: sourceEntity.location,
          status: 'REMNANT',
          isRemnant: true,
          reusable: true,
          sourceType: 'CUTTING_TASK',
          sourceId: task.id,
          receivedAt: new Date(),
          note: `锯切任务 ${task.taskNo} 由 ${sourceEntity.entityNo} 产生`,
        },
      })
      const remnantMovement = await tx.profileStockMovement.create({
        data: {
          entityId: remnantEntity.id,
          movementType: 'REMNANT_IN',
          quantityDelta: 1,
          beforeAvailableQty: 0,
          afterAvailableQty: 1,
          beforeReservedQty: 0,
          afterReservedQty: 0,
          beforeConsumedQty: 0,
          afterConsumedQty: 0,
          beforeScrappedQty: 0,
          afterScrappedQty: 0,
          beforeStatus: null,
          afterStatus: 'REMNANT',
          lengthBeforeMm: null,
          lengthAfterMm: remnantEntity.actualLengthMm,
          sourceType: 'CUTTING_TASK_REMNANT',
          sourceId: taskSource.id,
          sourceMovementId: sourceMovement.id,
          idempotencyKey: `CUTTING_TASK:${task.id}:SOURCE:${item.planSource.id}:REMNANT_IN`,
          operatorId: input.actor.id || null,
          operatorName: input.actor.name || null,
          note: `锯切任务 ${task.taskNo} 余料回库`,
        },
      })
      const remnantReceipt = await receiveCuttingRemnant(tx, {
        taskSourceId: taskSource.id,
        taskNo: task.taskNo,
        materialId: task.rawMaterialId,
        valuationQty: issue.valuationQty * lengthRatio,
        costAmount: issue.costAmount * lengthRatio,
        actor: input.actor,
      })
      await tx.cuttingTaskSource.update({
        where: { id: taskSource.id },
        data: {
          remnantEntityId: remnantEntity.id,
          remnantStockLogId: remnantReceipt.movement.id,
        },
      })
      remnantStockQty += 1
      remnantValuationQty += Number(remnantReceipt.quantities?.valuationQty || 0)
      remnantCostAmount += Number(remnantReceipt.costAmount || 0)
      void remnantMovement
    }
  }

  for (const [demandId, goodQty] of Array.from(completedByDemand.entries())) {
    const demand = await tx.cuttingDemand.findUniqueOrThrow({ where: { id: demandId } })
    const completedQty = demand.completedQty + goodQty
    await tx.cuttingDemand.update({
      where: { id: demand.id },
      data: {
        completedQty,
        status: completedQty >= demand.requiredQty
          ? 'COMPLETED'
          : demand.plannedQty >= demand.requiredQty ? 'PLANNED' : 'PARTIALLY_PLANNED',
      },
    })
  }
  await createProductionLotsForCuttingTask(tx, {
    taskId: task.id,
    netMaterialCostAmount: Math.max(0, issue.costAmount - remnantCostAmount),
  })

  await tx.cuttingPlan.update({ where: { id: plan.id }, data: { status: 'EXECUTED' } })
  return tx.cuttingTask.update({
    where: { id: task.id },
    data: {
      status: 'COMPLETED',
      completeRequestId: input.completion.clientRequestId,
      completedAt: new Date(),
      completedBy: input.actor.name || null,
      completedById: input.actor.id || null,
      issueStockQty: issue.stockQty,
      issueValuationQty: issue.valuationQty,
      issueCostAmount: issue.costAmount,
      issueConversionRate: issue.conversionRateUsed,
      issueConversionSource: issue.conversionSource,
      issueCostingMethod: issue.costingMethod,
      stockIssueLogId: issue.movement.id,
      remnantStockQty: roundValue(remnantStockQty),
      remnantValuationQty: roundValue(remnantValuationQty),
      remnantCostAmount: roundValue(remnantCostAmount),
    },
    include: {
      cuttingPlan: true,
      sources: { include: { outputs: true, sourceEntity: true, remnantEntity: true } },
    },
  })
}

export async function reverseCuttingTask(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    reason: string
    actor: CuttingTaskActor
  },
) {
  const task = await tx.cuttingTask.findUnique({
    where: { id: input.taskId },
    include: {
      cuttingPlan: true,
      sources: {
        include: {
          outputs: true,
          sourceEntity: true,
          remnantEntity: {
            include: {
              movements: { orderBy: { createdAt: 'asc' } },
              _count: { select: { childEntities: true } },
            },
          },
        },
      },
    },
  })
  if (!task) throw new Error('锯切任务不存在')
  if (task.status === 'REVERSED') return task
  if (task.status !== 'COMPLETED') throw new Error('只有已完工且未冲销的锯切任务可以冲销')
  if (task.cuttingPlan.status !== 'EXECUTED') throw new Error('排样方案状态已变化，不能冲销锯切任务')
  const reversedLots = await ensureCuttingTaskLotsReversible(tx, {
    taskId: task.id,
    reason: input.reason,
    actor: input.actor,
  })

  for (const source of task.sources) {
    const remnant = source.remnantEntity
    if (!remnant) continue
    const untouched = (
      remnant.status === 'REMNANT'
      && remnant.availableQty === 1
      && remnant.reservedQty === 0
      && remnant.consumedQty === 0
      && remnant.scrappedQty === 0
      && remnant.splitQty === 0
      && remnant._count.childEntities === 0
      && remnant.movements.length === 1
      && remnant.movements[0]?.movementType === 'REMNANT_IN'
    )
    if (!untouched) throw new Error(`余料实体 ${remnant.entityNo} 已被后续使用，不能冲销锯切任务`)
  }

  for (const source of task.sources) {
    const remnant = source.remnantEntity
    if (remnant) {
      await reverseCuttingRemnantReceipt(tx, {
        taskSourceId: source.id,
        taskNo: task.taskNo,
        materialId: task.rawMaterialId,
        sourceMovementId: source.remnantStockLogId,
        reason: input.reason,
        actor: input.actor,
      })
      const remnantInMovement = remnant.movements[0]
      const reversalMovement = await tx.profileStockMovement.create({
        data: {
          entityId: remnant.id,
          movementType: 'REMNANT_REVERSAL',
          quantityDelta: -1,
          beforeAvailableQty: 1,
          afterAvailableQty: 0,
          beforeReservedQty: 0,
          afterReservedQty: 0,
          beforeConsumedQty: 0,
          afterConsumedQty: 0,
          beforeScrappedQty: 0,
          afterScrappedQty: 0,
          beforeStatus: 'REMNANT',
          afterStatus: 'REVERSED',
          lengthBeforeMm: remnant.actualLengthMm,
          lengthAfterMm: remnant.actualLengthMm,
          sourceType: 'CUTTING_TASK_REVERSAL',
          sourceId: task.id,
          sourceMovementId: remnantInMovement.id,
          idempotencyKey: `CUTTING_TASK:${task.id}:SOURCE:${source.planSourceId}:REMNANT_REVERSE`,
          operatorId: input.actor.id || null,
          operatorName: input.actor.name || null,
          note: `冲销锯切任务 ${task.taskNo}：${input.reason}`,
        },
      })
      await tx.profileStockMovement.update({
        where: { id: remnantInMovement.id },
        data: { reversalMovementId: reversalMovement.id },
      })
      await tx.profileStockEntity.update({
        where: { id: remnant.id },
        data: {
          availableQty: 0,
          status: 'REVERSED',
          reusable: false,
          reversedAt: new Date(),
        },
      })
    }

    const sourceEntity = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: source.sourceEntityId } })
    if (sourceEntity.consumedQty <= 0) throw new Error(`来源实体 ${sourceEntity.entityNo} 的已耗用数量异常`)
    const afterReservedQty = sourceEntity.reservedQty + 1
    const afterConsumedQty = sourceEntity.consumedQty - 1
    const afterStatus = sourceStatusAfterRestore({
      availableQty: sourceEntity.availableQty,
      reservedQty: afterReservedQty,
      isRemnant: sourceEntity.isRemnant,
    })
    await tx.profileStockEntity.update({
      where: { id: sourceEntity.id },
      data: {
        reservedQty: afterReservedQty,
        consumedQty: afterConsumedQty,
        status: afterStatus,
      },
    })
    const consumeMovement = await tx.profileStockMovement.findUnique({
      where: { idempotencyKey: `CUTTING_TASK:${task.id}:SOURCE:${source.planSourceId}:CONSUME` },
    })
    const restoreMovement = await tx.profileStockMovement.create({
      data: {
        entityId: sourceEntity.id,
        movementType: 'RESTORE_CUTTING_CONSUMPTION',
        quantityDelta: 0,
        beforeAvailableQty: sourceEntity.availableQty,
        afterAvailableQty: sourceEntity.availableQty,
        beforeReservedQty: sourceEntity.reservedQty,
        afterReservedQty,
        beforeConsumedQty: sourceEntity.consumedQty,
        afterConsumedQty,
        beforeScrappedQty: sourceEntity.scrappedQty,
        afterScrappedQty: sourceEntity.scrappedQty,
        beforeStatus: sourceEntity.status,
        afterStatus,
        lengthBeforeMm: sourceEntity.actualLengthMm,
        lengthAfterMm: sourceEntity.actualLengthMm,
        sourceType: 'CUTTING_TASK_REVERSAL',
        sourceId: task.id,
        sourceMovementId: consumeMovement?.id,
        idempotencyKey: `CUTTING_TASK:${task.id}:SOURCE:${source.planSourceId}:RESTORE`,
        operatorId: input.actor.id || null,
        operatorName: input.actor.name || null,
        note: `冲销锯切任务 ${task.taskNo}，恢复原料占用`,
      },
    })
    if (consumeMovement) {
      await tx.profileStockMovement.update({
        where: { id: consumeMovement.id },
        data: { reversalMovementId: restoreMovement.id },
      })
    }
  }

  await reverseCuttingInventoryIssue(tx, {
    taskId: task.id,
    taskNo: task.taskNo,
    materialId: task.rawMaterialId,
    stockQty: Number(task.issueStockQty),
    valuationQty: Number(task.issueValuationQty),
    reservedValuationQty: Number(task.cuttingPlan.reservedValuationQty),
    costAmount: Number(task.issueCostAmount),
    costingMethod: task.issueCostingMethod,
    sourceMovementId: task.stockIssueLogId,
    reason: input.reason,
    actor: input.actor,
  })

  const completedByDemand = new Map<string, number>()
  for (const source of task.sources) {
    for (const output of source.outputs) {
      completedByDemand.set(
        output.cuttingDemandId,
        (completedByDemand.get(output.cuttingDemandId) || 0) + output.goodQty,
      )
    }
  }
  for (const [demandId, goodQty] of Array.from(completedByDemand.entries())) {
    const demand = await tx.cuttingDemand.findUniqueOrThrow({ where: { id: demandId } })
    const completedQty = Math.max(0, demand.completedQty - goodQty)
    await tx.cuttingDemand.update({
      where: { id: demand.id },
      data: {
        completedQty,
        status: completedQty >= demand.requiredQty
          ? 'COMPLETED'
          : demand.plannedQty >= demand.requiredQty ? 'PLANNED' : 'PARTIALLY_PLANNED',
      },
    })
  }
  for (const orderId of Array.from(new Set(reversedLots.map((lot) => lot.productionOrderId)))) {
    await refreshProductionOrderFromLots(tx, orderId)
  }

  await tx.cuttingPlan.update({ where: { id: task.cuttingPlanId }, data: { status: 'CONFIRMED' } })
  return tx.cuttingTask.update({
    where: { id: task.id },
    data: {
      status: 'REVERSED',
      reversalStockLogId: task.stockIssueLogId
        ? (await tx.stockLog.findUnique({
          where: { idempotencyKey: `CUTTING_TASK:${task.id}:STOCK_REVERSE` },
          select: { id: true },
        }))?.id || null
        : null,
      reversedAt: new Date(),
      reversedBy: input.actor.name || null,
      reversedById: input.actor.id || null,
      reverseReason: input.reason,
    },
    include: {
      cuttingPlan: true,
      sources: { include: { outputs: true, sourceEntity: true, remnantEntity: true } },
    },
  })
}
