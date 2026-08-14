import { Prisma } from '@prisma/client'
import type { AuditContext, AuditInput } from '@/lib/audit'
import { createAuditLog } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { unrestrictedDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import type { CompleteEquipmentInspectionInput, EquipmentInspectionPlanInput } from '../contracts/equipment-inspection-schema'
import { EquipmentDomainError } from '../domain/equipment-errors'
import { normalizeEquipmentCode } from '../domain/equipment-rules'
import {
  assertEquipmentInspectionScope,
  assertInspectionResults,
  inspectionResultOf,
  nextInspectionDue,
} from '../domain/equipment-inspection-rules'

export interface EquipmentInspectionActor {
  operatorId?: string | null
  operatorName: string
  auditContext: AuditContext
}

function inspectionRecordNo(inspectedAt: Date, operationId: string) {
  const stamp = [inspectedAt.getFullYear(), String(inspectedAt.getMonth() + 1).padStart(2, '0'), String(inspectedAt.getDate()).padStart(2, '0')].join('')
  return `EI-${stamp}-${operationId.replace(/-/g, '').slice(0, 12).toUpperCase()}`
}

async function withInspectionErrors<T>(operation: () => Promise<T>) {
  try { return await operation() } catch (error) {
    if (error instanceof EquipmentDomainError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new EquipmentDomainError('点检计划编码或点检记录已存在', 409)
    }
    throw error
  }
}

export async function createEquipmentInspectionPlan(
  input: EquipmentInspectionPlanInput,
  actor: EquipmentInspectionActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
) {
  return withInspectionErrors(() => prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findFirst({
      where: { id: input.equipmentId, deletedAt: null },
      select: { id: true, code: true, name: true, workCenterId: true },
    })
    if (!equipment) throw new EquipmentDomainError('设备不存在或已归档', 404)
    assertEquipmentInspectionScope(scope, equipment.workCenterId)
    const plan = await tx.equipmentInspectionPlan.create({
      data: {
        code: normalizeEquipmentCode(input.code), name: input.name.trim(), equipmentId: equipment.id,
        intervalDays: input.intervalDays, nextDueAt: input.nextDueAt, note: input.note?.trim() || null,
        createdBy: actor.operatorName.trim(),
        items: { create: input.items.map((item, index) => ({
          name: item.name.trim(), standard: item.standard.trim(), unit: item.unit?.trim() || null, sortOrder: index + 1,
        })) },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } }, equipment: true },
    })
    await createAuditLog(tx, actor.auditContext, {
      action: 'EQUIPMENT_INSPECTION_PLAN_CREATE', entityType: 'EQUIPMENT_INSPECTION_PLAN',
      entityId: plan.id, entityLabel: `${plan.code} ${plan.name}`, afterData: plan, note: input.note || undefined,
    })
    return plan
  }))
}

export async function changeEquipmentInspectionPlanStatus(
  id: string,
  action: 'PAUSE' | 'RESUME',
  actor: EquipmentInspectionActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.equipmentInspectionPlan.findUnique({
      where: { id }, include: { equipment: { select: { workCenterId: true, deletedAt: true } }, items: true },
    })
    if (!existing || existing.equipment.deletedAt) throw new EquipmentDomainError('点检计划不存在或设备已归档', 404)
    assertEquipmentInspectionScope(scope, existing.equipment.workCenterId)
    const target = action === 'PAUSE' ? 'PAUSED' : 'ACTIVE'
    if (existing.status === target) throw new EquipmentDomainError(`点检计划已经是${target === 'ACTIVE' ? '启用' : '暂停'}状态`, 409)
    const saved = await tx.equipmentInspectionPlan.update({
      where: { id }, data: { status: target, ...(target === 'ACTIVE' && existing.nextDueAt < now ? { nextDueAt: now, activatedAt: now } : {}) },
      include: { items: { orderBy: { sortOrder: 'asc' } }, equipment: true },
    })
    await createAuditLog(tx, actor.auditContext, {
      action: `EQUIPMENT_INSPECTION_PLAN_${action}`, entityType: 'EQUIPMENT_INSPECTION_PLAN',
      entityId: saved.id, entityLabel: `${saved.code} ${saved.name}`, beforeData: existing, afterData: saved,
    })
    return { existing, saved }
  })
}

export async function completeEquipmentInspection(
  planId: string,
  input: CompleteEquipmentInspectionInput,
  actor: EquipmentInspectionActor,
  scope: EffectiveDataScope = unrestrictedDataScope,
  now = new Date(),
) {
  return withInspectionErrors(() => prisma.$transaction(async (tx) => {
    if (input.inspectedAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new EquipmentDomainError('点检时间不能晚于当前时间')
    const plan = await tx.equipmentInspectionPlan.findUnique({
      where: { id: planId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, equipment: { include: { workCenter: true } } },
    })
    if (!plan || plan.equipment.deletedAt) throw new EquipmentDomainError('点检计划不存在或设备已归档', 404)
    assertEquipmentInspectionScope(scope, plan.equipment.workCenterId)
    const duplicate = await tx.equipmentInspectionRecord.findUnique({
      where: { operationId: input.operationId }, include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
    if (duplicate) {
      if (duplicate.planId !== plan.id) throw new EquipmentDomainError('点检幂等标识已被其他计划使用', 409)
      return { record: duplicate, duplicate: true, nextDueAt: plan.nextDueAt, faultEventId: duplicate.faultEventId }
    }
    if (plan.status !== 'ACTIVE') throw new EquipmentDomainError('只有启用中的点检计划可以执行', 409)
    if (input.inspectedAt < plan.nextDueAt) throw new EquipmentDomainError('点检计划尚未到期，不能提前重置周期', 409)
    assertInspectionResults(plan.items, input.items)
    const result = inspectionResultOf(input.items)
    let faultEventId: string | null = null
    if (result === 'ABNORMAL' && ['AVAILABLE', 'IN_USE'].includes(plan.equipment.status)) {
      const failedItems = input.items.filter((item) => item.result === 'FAIL')
      const event = await tx.equipmentEvent.create({
        data: {
          equipmentId: plan.equipmentId, eventType: 'FAULT', sourceStatus: plan.equipment.status, targetStatus: 'FAULT',
          reason: `点检异常：${failedItems.map((item) => plan.items.find((planItem) => planItem.id === item.planItemId)?.name).filter(Boolean).join('、')}`,
          note: failedItems.map((item) => item.note).filter(Boolean).join('；') || null,
          operatorId: actor.operatorId || null, operatorName: actor.operatorName.trim(), occurredAt: input.inspectedAt,
        },
      })
      faultEventId = event.id
    }
    const dueAt = plan.nextDueAt
    const record = await tx.equipmentInspectionRecord.create({
      data: {
        recordNo: inspectionRecordNo(input.inspectedAt, input.operationId), operationId: input.operationId,
        planId: plan.id, equipmentId: plan.equipmentId, dueAt, inspectedAt: input.inspectedAt, result,
        inspectorId: actor.operatorId || null, inspectorName: actor.operatorName.trim(), note: input.note?.trim() || null,
        faultEventId,
        items: { create: plan.items.map((planItem) => {
          const submitted = input.items.find((item) => item.planItemId === planItem.id)!
          return {
            planItemId: planItem.id, itemName: planItem.name, standard: planItem.standard, unit: planItem.unit,
            actualValue: submitted.actualValue?.trim() || null, result: submitted.result,
            note: submitted.note?.trim() || null, sortOrder: planItem.sortOrder,
          }
        }) },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
    const nextDueAt = nextInspectionDue(dueAt, plan.intervalDays, input.inspectedAt)
    await tx.equipmentInspectionPlan.update({ where: { id: plan.id }, data: { nextDueAt } })
    const audit: AuditInput = {
      action: result === 'ABNORMAL' ? 'EQUIPMENT_INSPECTION_ABNORMAL' : 'EQUIPMENT_INSPECTION_PASS',
      entityType: 'EQUIPMENT_INSPECTION_RECORD', entityId: record.id, entityLabel: record.recordNo,
      afterData: record, note: input.note || undefined,
    }
    await createAuditLog(tx, actor.auditContext, audit)
    return { record, duplicate: false, nextDueAt, faultEventId }
  }))
}
