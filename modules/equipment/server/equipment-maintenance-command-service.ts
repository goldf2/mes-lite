import { Prisma } from '@prisma/client'
import type { AuditContext } from '@/lib/audit'
import { createAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import {
  assertInventoryLocationDataScope,
  unrestrictedDataScope,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import {
  consumeAvailableInventoryLotsForReference,
  issueInventoryForBusinessReference,
} from '@/modules/inventory'
import type {
  CompleteEquipmentMaintenanceWorkOrderInput,
  CreateCorrectiveMaintenanceWorkOrderInput,
  CreatePreventiveMaintenanceWorkOrderInput,
  EquipmentMaintenancePlanInput,
} from '../contracts/equipment-maintenance-schema'
import { EquipmentDomainError } from '../domain/equipment-errors'
import {
  assertEquipmentMaintenanceScope,
  assertMaintenanceCompletionItems,
  nextMaintenanceDue,
} from '../domain/equipment-maintenance-rules'
import { normalizeEquipmentCode } from '../domain/equipment-rules'
import { closeLatestEquipmentIncident } from './equipment-event-service'

export interface EquipmentMaintenanceActor {
  operatorId?: string | null
  operatorName: string
  auditContext: AuditContext
}

export const equipmentMaintenanceWorkOrderInclude = {
  equipment: { include: { workCenter: true } },
  plan: { include: { items: { orderBy: { sortOrder: 'asc' as const } } } },
  results: { orderBy: { sortOrder: 'asc' as const } },
  spares: {
    include: {
      material: { select: { id: true, code: true, name: true } },
      location: { select: { id: true, code: true, name: true } },
      lotAllocations: { include: { lot: { select: { id: true, lotNo: true } } }, orderBy: { createdAt: 'asc' as const } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.EquipmentMaintenanceWorkOrderInclude

function workOrderNo(now: Date, operationId: string) {
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('')
  return `EM-${stamp}-${operationId.replace(/-/g, '').slice(-12).toUpperCase()}`
}

async function withMaintenanceErrors<T>(operation: () => Promise<T>) {
  try { return await operation() } catch (error) {
    if (error instanceof EquipmentDomainError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new EquipmentDomainError('计划编码、工单编号或操作标识已存在', 409)
    }
    throw error
  }
}

export async function createEquipmentMaintenancePlan(
  input: EquipmentMaintenancePlanInput,
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return withMaintenanceErrors(() => prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({
      where: { id: input.equipmentId, deletedAt: null },
      select: { id: true, code: true, name: true, workCenterId: true },
    })
    if (!equipment) throw new EquipmentDomainError('设备不存在或已归档', 404)
    assertEquipmentMaintenanceScope(scope, equipment.workCenterId)
    const plan = await tx.equipmentMaintenancePlan.create({
      data: {
        code: normalizeEquipmentCode(input.code), name: input.name.trim(), equipmentId: equipment.id,
        intervalDays: input.intervalDays, nextDueAt: input.nextDueAt, note: input.note?.trim() || null,
        createdBy: actor.operatorName.trim(),
        items: { create: input.items.map((item, index) => ({ name: item.name.trim(), standard: item.standard.trim(), sortOrder: index + 1 })) },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } }, equipment: { include: { workCenter: true } }, workOrders: true },
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_MAINTENANCE_PLAN_CREATE', entityType: 'EQUIPMENT_MAINTENANCE_PLAN',
      entityId: plan.id, entityLabel: `${plan.code} ${plan.name}`, afterData: plan, note: input.note || undefined,
    })
    return plan
  }))
}

export async function changeEquipmentMaintenancePlanStatus(
  id: string,
  action: 'PAUSE' | 'RESUME',
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.equipmentMaintenancePlan.findUnique({
      where: { id }, include: { equipment: { select: { workCenterId: true, deletedAt: true } }, items: true },
    })
    if (!existing || existing.equipment.deletedAt) throw new EquipmentDomainError('保养计划不存在或设备已归档', 404)
    assertEquipmentMaintenanceScope(scope, existing.equipment.workCenterId)
    const target = action === 'PAUSE' ? 'PAUSED' : 'ACTIVE'
    if (existing.status === target) throw new EquipmentDomainError(`保养计划已经是${target === 'ACTIVE' ? '启用' : '暂停'}状态`, 409)
    const saved = await tx.equipmentMaintenancePlan.update({
      where: { id }, data: { status: target, ...(target === 'ACTIVE' && existing.nextDueAt < now ? { nextDueAt: now, activatedAt: now } : {}) },
      include: { items: { orderBy: { sortOrder: 'asc' } }, equipment: { include: { workCenter: true } }, workOrders: true },
    })
    await createAuditLog(tx, actor.auditContext, {
      action: `EQUIPMENT_MAINTENANCE_PLAN_${action}`, entityType: 'EQUIPMENT_MAINTENANCE_PLAN',
      entityId: saved.id, entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return { existing, saved }
  })
}

export async function createPreventiveMaintenanceWorkOrder(
  planId: string,
  input: CreatePreventiveMaintenanceWorkOrderInput,
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return withMaintenanceErrors(() => prisma.$transaction(async (tx) => {
    const duplicate = await tx.equipmentMaintenanceWorkOrder.findUnique({ where: { createOperationId: input.operationId }, include: equipmentMaintenanceWorkOrderInclude })
    if (duplicate) {
      if (duplicate.planId !== planId) throw new EquipmentDomainError('工单幂等标识已被其他计划使用', 409)
      return { workOrder: duplicate, duplicate: true }
    }
    const plan = await tx.equipmentMaintenancePlan.findUnique({
      where: { id: planId }, include: { items: { orderBy: { sortOrder: 'asc' } }, equipment: { include: { workCenter: true } } },
    })
    if (!plan || plan.equipment.deletedAt) throw new EquipmentDomainError('保养计划不存在或设备已归档', 404)
    assertEquipmentMaintenanceScope(scope, plan.equipment.workCenterId)
    if (plan.status !== 'ACTIVE') throw new EquipmentDomainError('只有启用中的保养计划可以生成工单', 409)
    if (plan.nextDueAt > now) throw new EquipmentDomainError('保养计划尚未到期，不能提前生成工单', 409)
    const existing = await tx.equipmentMaintenanceWorkOrder.findFirst({ where: { planId: plan.id, planDueAt: plan.nextDueAt, status: { not: 'CANCELLED' } } })
    if (existing) throw new EquipmentDomainError('当前应保周期已经存在有效工单', 409)
    const workOrder = await tx.equipmentMaintenanceWorkOrder.create({
      data: {
        workOrderNo: workOrderNo(now, input.operationId), createOperationId: input.operationId, kind: 'PREVENTIVE',
        equipmentId: plan.equipmentId, planId: plan.id, planDueAt: plan.nextDueAt, dueAt: plan.nextDueAt,
        title: plan.name, priority: 'NORMAL', assignedTo: input.assignedTo?.trim() || null,
        createdById: actor.operatorId || null, createdByName: actor.operatorName.trim(),
      },
      include: equipmentMaintenanceWorkOrderInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_MAINTENANCE_WORK_ORDER_CREATE', entityType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER',
      entityId: workOrder.id, entityLabel: workOrder.workOrderNo, afterData: workOrder,
    })
    return { workOrder, duplicate: false }
  }))
}

export async function createCorrectiveMaintenanceWorkOrder(
  input: CreateCorrectiveMaintenanceWorkOrderInput,
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return withMaintenanceErrors(() => prisma.$transaction(async (tx) => {
    const duplicate = await tx.equipmentMaintenanceWorkOrder.findUnique({ where: { createOperationId: input.operationId }, include: equipmentMaintenanceWorkOrderInclude })
    if (duplicate) {
      if (duplicate.equipmentId !== input.equipmentId || duplicate.kind !== 'CORRECTIVE') throw new EquipmentDomainError('工单幂等标识已被其他业务使用', 409)
      return { workOrder: duplicate, duplicate: true }
    }
    const equipment = await tx.equipment.findFirst({ where: { id: input.equipmentId, deletedAt: null }, include: { workCenter: true } })
    if (!equipment) throw new EquipmentDomainError('设备不存在或已归档', 404)
    assertEquipmentMaintenanceScope(scope, equipment.workCenterId)
    if (equipment.status === 'MAINTENANCE') throw new EquipmentDomainError('设备已有进行中的维修作业', 409)
    let faultEventId: string | null = null
    if (['AVAILABLE', 'IN_USE'].includes(equipment.status)) {
      const event = await tx.equipmentEvent.create({
        data: {
          equipmentId: equipment.id, eventType: 'FAULT', sourceStatus: equipment.status, targetStatus: 'FAULT',
          reason: input.faultDescription.trim(), note: `维修主题：${input.title.trim()}`,
          operatorId: actor.operatorId || null, operatorName: actor.operatorName.trim(), occurredAt: now,
        },
      })
      faultEventId = event.id
    } else if (equipment.status === 'FAULT') {
      faultEventId = (await tx.equipmentEvent.findFirst({ where: { equipmentId: equipment.id, targetStatus: 'FAULT', endedAt: null }, orderBy: { occurredAt: 'desc' } }))?.id || null
    }
    const workOrder = await tx.equipmentMaintenanceWorkOrder.create({
      data: {
        workOrderNo: workOrderNo(now, input.operationId), createOperationId: input.operationId, kind: 'CORRECTIVE',
        equipmentId: equipment.id, title: input.title.trim(), priority: input.priority,
        faultDescription: input.faultDescription.trim(), assignedTo: input.assignedTo?.trim() || null, dueAt: input.dueAt || null,
        faultEventId, createdById: actor.operatorId || null, createdByName: actor.operatorName.trim(),
      },
      include: equipmentMaintenanceWorkOrderInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_MAINTENANCE_WORK_ORDER_CREATE', entityType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER',
      entityId: workOrder.id, entityLabel: workOrder.workOrderNo, afterData: workOrder, note: input.faultDescription,
    })
    return { workOrder, duplicate: false }
  }))
}

export async function startEquipmentMaintenanceWorkOrder(
  id: string,
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.equipmentMaintenanceWorkOrder.findUnique({ where: { id }, include: equipmentMaintenanceWorkOrderInclude })
    if (!existing || existing.equipment.deletedAt) throw new EquipmentDomainError('维修工单不存在或设备已归档', 404)
    assertEquipmentMaintenanceScope(scope, existing.equipment.workCenterId)
    if (existing.status === 'IN_PROGRESS') return { workOrder: existing, duplicate: true }
    if (existing.status !== 'OPEN') throw new EquipmentDomainError('只有待处理工单可以开始维修', 409)
    if (existing.equipment.status === 'MAINTENANCE') throw new EquipmentDomainError('设备已有其他进行中的维修作业', 409)
    if (!['AVAILABLE', 'IN_USE', 'STOPPED', 'FAULT'].includes(existing.equipment.status)) throw new EquipmentDomainError('设备当前状态不能进入维修', 409)
    await closeLatestEquipmentIncident(tx, existing.equipmentId, existing.equipment.status, now)
    const startEvent = await tx.equipmentEvent.create({
      data: {
        equipmentId: existing.equipmentId, eventType: 'MAINTAIN', sourceStatus: existing.equipment.status, targetStatus: 'MAINTENANCE',
        reason: `${existing.workOrderNo} 开始${existing.kind === 'PREVENTIVE' ? '保养' : '维修'}`,
        note: existing.faultDescription || existing.title, operatorId: actor.operatorId || null,
        operatorName: actor.operatorName.trim(), occurredAt: now,
      },
    })
    const workOrder = await tx.equipmentMaintenanceWorkOrder.update({
      where: { id }, data: { status: 'IN_PROGRESS', startedAt: now, startedById: actor.operatorId || null, startedByName: actor.operatorName.trim(), startEventId: startEvent.id },
      include: equipmentMaintenanceWorkOrderInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_MAINTENANCE_WORK_ORDER_START', entityType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER',
      entityId: workOrder.id, entityLabel: workOrder.workOrderNo, beforeData: existing, afterData: workOrder,
    })
    return { workOrder, duplicate: false }
  })
}

export async function completeEquipmentMaintenanceWorkOrder(
  id: string,
  input: CompleteEquipmentMaintenanceWorkOrderInput,
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return withMaintenanceErrors(() => prisma.$transaction(async (tx) => {
    const duplicate = await tx.equipmentMaintenanceWorkOrder.findUnique({ where: { completionOperationId: input.operationId }, include: equipmentMaintenanceWorkOrderInclude })
    if (duplicate) {
      if (duplicate.id !== id) throw new EquipmentDomainError('完成幂等标识已被其他工单使用', 409)
      return { workOrder: duplicate, duplicate: true }
    }
    const existing = await tx.equipmentMaintenanceWorkOrder.findUnique({ where: { id }, include: equipmentMaintenanceWorkOrderInclude })
    if (!existing || existing.equipment.deletedAt) throw new EquipmentDomainError('维修工单不存在或设备已归档', 404)
    assertEquipmentMaintenanceScope(scope, existing.equipment.workCenterId)
    assertInventoryLocationDataScope(scope, input.spares.map((item) => item.locationId))
    if (existing.status !== 'IN_PROGRESS') throw new EquipmentDomainError('只有维修中的工单可以完成', 409)
    if (existing.equipment.status !== 'MAINTENANCE') throw new EquipmentDomainError('设备不在维修状态，不能完成工单', 409)
    if (input.completedAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new EquipmentDomainError('完成时间不能晚于当前时间', 400)
    if (existing.startedAt && input.completedAt < existing.startedAt) throw new EquipmentDomainError('完成时间不能早于开始时间', 400)
    assertMaintenanceCompletionItems(existing, input.items)
    const spareKeys = input.spares.map((item) => `${item.materialId}:${item.locationId}`)
    if (new Set(spareKeys).size !== spareKeys.length) throw new EquipmentDomainError('同一备件和库位只能提交一条领用记录', 400)

    if (existing.kind === 'PREVENTIVE') {
      await tx.equipmentMaintenanceWorkResult.createMany({ data: existing.plan!.items.map((planItem) => {
        const submitted = input.items.find((item) => item.planItemId === planItem.id)!
        return {
          workOrderId: existing.id, planItemId: planItem.id, itemName: planItem.name,
          standard: planItem.standard, result: submitted.result, note: submitted.note?.trim() || null, sortOrder: planItem.sortOrder,
        }
      }) })
    }

    for (const spare of input.spares) {
      const issue = await issueInventoryForBusinessReference(tx, {
        materialId: spare.materialId, stockQty: spare.stockQty, type: 'EQUIPMENT_MAINTENANCE_CONSUME',
        refType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER', refId: existing.id,
        note: `${existing.workOrderNo} 维修备件领用${spare.note ? `：${spare.note.trim()}` : ''}`,
        createdBy: actor.operatorName, locationId: spare.locationId,
        idempotencyKey: `EQUIPMENT_MAINTENANCE:${existing.id}:SPARE:${spare.materialId}:${spare.locationId}`,
      })
      if (issue.duplicate || !issue.material || !issue.location || !issue.movement) {
        throw new EquipmentDomainError('备件领用幂等状态异常，请刷新工单后重试', 409)
      }
      const issuedStockQty = Number(issue.stockQty)
      const issuedValuationQty = Number(issue.valuationQty)
      const issuedCostAmount = Number(issue.costAmount)
      const usage = await tx.equipmentMaintenanceSpareUsage.create({
        data: {
          workOrderId: existing.id, materialId: spare.materialId, locationId: issue.location.id,
          stockQty: issuedStockQty, valuationQty: issuedValuationQty, costAmount: issuedCostAmount,
          stockUnitSnapshot: issue.material.stockUnit, valuationUnitSnapshot: issue.material.valuationUnit,
          conversionRateUsed: Number(issue.conversionRateUsed), costingMethodSnapshot: issue.material.costingMethod,
          stockLogId: issue.movement.id, note: spare.note?.trim() || null, createdBy: actor.operatorName.trim(),
        },
      })
      const lots = await consumeAvailableInventoryLotsForReference(tx, {
        materialId: spare.materialId, materialCode: issue.material.code,
        locationId: issue.location.id, locationCode: issue.location.code, stockQty: issuedStockQty,
        issueValuationQty: issuedValuationQty, issueCostAmount: issuedCostAmount,
        refType: 'EQUIPMENT_MAINTENANCE_SPARE', refId: usage.id, transactionType: 'EQUIPMENT_MAINTENANCE_CONSUME',
        idempotencyPrefix: `EQUIPMENT_MAINTENANCE:${existing.id}:SPARE:${usage.id}`,
        note: `${existing.workOrderNo} 维修备件批次领用`, stockLogId: issue.movement.id, createdBy: actor.operatorName,
      })
      await tx.equipmentMaintenanceSpareLotAllocation.createMany({ data: lots.map((lot) => ({
        spareUsageId: usage.id, lotId: lot.lotId, locationId: lot.locationId,
        stockQty: lot.stockQty, valuationQty: lot.valuationQty, costAmount: lot.costAmount,
      })) })
    }

    await closeLatestEquipmentIncident(tx, existing.equipmentId, 'MAINTENANCE', input.completedAt)
    const recoveryEvent = await tx.equipmentEvent.create({
      data: {
        equipmentId: existing.equipmentId, eventType: 'RECOVER', sourceStatus: 'MAINTENANCE', targetStatus: 'AVAILABLE',
        reason: `${existing.workOrderNo} 作业完成`, note: input.workDescription.trim(),
        operatorId: actor.operatorId || null, operatorName: actor.operatorName.trim(), occurredAt: input.completedAt,
      },
    })
    const workOrder = await tx.equipmentMaintenanceWorkOrder.update({
      where: { id }, data: {
        status: 'COMPLETED', completedAt: input.completedAt, completedById: actor.operatorId || null,
        completedByName: actor.operatorName.trim(), completionOperationId: input.operationId,
        workDescription: input.workDescription.trim(), failureCause: input.failureCause?.trim() || null,
        recoveryEventId: recoveryEvent.id,
      },
      include: equipmentMaintenanceWorkOrderInclude,
    })
    let nextDueAt: Date | null = null
    if (existing.kind === 'PREVENTIVE' && existing.plan && existing.planDueAt) {
      nextDueAt = nextMaintenanceDue(existing.planDueAt, existing.plan.intervalDays, input.completedAt)
      await tx.equipmentMaintenancePlan.update({ where: { id: existing.plan.id }, data: { nextDueAt } })
    }
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_MAINTENANCE_WORK_ORDER_COMPLETE', entityType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER',
      entityId: workOrder.id, entityLabel: workOrder.workOrderNo, beforeData: existing, afterData: workOrder,
      note: input.workDescription,
    })
    return { workOrder, duplicate: false, nextDueAt }
  }))
}

export async function cancelEquipmentMaintenanceWorkOrder(
  id: string,
  reason: string,
  actor: EquipmentMaintenanceActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.equipmentMaintenanceWorkOrder.findUnique({ where: { id }, include: equipmentMaintenanceWorkOrderInclude })
    if (!existing || existing.equipment.deletedAt) throw new EquipmentDomainError('维修工单不存在或设备已归档', 404)
    assertEquipmentMaintenanceScope(scope, existing.equipment.workCenterId)
    if (existing.status !== 'OPEN') throw new EquipmentDomainError('只有待处理工单可以取消', 409)
    const workOrder = await tx.equipmentMaintenanceWorkOrder.update({
      where: { id }, data: { status: 'CANCELLED', cancelledAt: now, cancelledById: actor.operatorId || null, cancelledByName: actor.operatorName.trim(), cancelReason: reason.trim() },
      include: equipmentMaintenanceWorkOrderInclude,
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_MAINTENANCE_WORK_ORDER_CANCEL', entityType: 'EQUIPMENT_MAINTENANCE_WORK_ORDER',
      entityId: workOrder.id, entityLabel: workOrder.workOrderNo, beforeData: existing, afterData: workOrder, note: reason,
    })
    return { existing, workOrder }
  })
}
