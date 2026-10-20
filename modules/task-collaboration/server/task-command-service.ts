import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit-core'
import { hasResourcePermission, type PermissionResource } from '@/lib/permissions'
import { requireManagedAttachmentAccessForOperator, type AttachmentOperator } from '@/modules/attachments/server-index'
import { assertTaskCollaborationDataScope, type EffectiveDataScope } from '@/modules/identity-access'
import { TaskCollaborationDomainError as TaskError } from '../domain/task-errors'
import type { TaskDraftInput, TaskFileReference } from '../contracts/task-schema'
import { assertTaskReferences } from './task-reference-service'
import { getTask } from './task-query-service'

export type TaskActor = AttachmentOperator & { id: string; name: string }
export async function validateTaskInputAccess(actor: TaskActor, input: Pick<Partial<TaskDraftInput>, 'salesOrderId' | 'productionOrderId' | 'assigneeEmployeeId' | 'supplierId' | 'workCenterId' | 'lines' | 'documentRefs'> & { dispatchId?: string | null }) {
  const resources: PermissionResource[] = []
  if (input.salesOrderId) resources.push('salesOrder')
  if (input.productionOrderId) resources.push('orders')
  if (input.dispatchId) resources.push('dispatch')
  if (input.assigneeEmployeeId) resources.push('employees')
  if (input.supplierId) resources.push('suppliers')
  if (input.workCenterId) resources.push('workCenters')
  if (input.lines?.length) resources.push('materials')
  for (const resource of Array.from(new Set(resources))) {
    if (!await hasResourcePermission(actor, resource, 'read')) throw new TaskError('无关联资料读取权限', 403, 'PERMISSION_DENIED')
  }
  const refs = [...(input.documentRefs || []), ...(input.lines || []).flatMap(line => line.documentRefs || [])]
  await validateTaskFileAccess(actor, refs)
}
export async function validateTaskFileAccess(actor: TaskActor, refs: TaskFileReference[]) {
  for (const ref of refs) await requireManagedAttachmentAccessForOperator(actor, ref.attachmentId, 'read')
}
export async function requireTask(tx: Prisma.TransactionClient, id: string, scope: EffectiveDataScope, archived = false) {
  const task = await tx.taskCollaboration.findUnique({ where: { id } })
  if (!task || (!archived && task.deletedAt)) throw new TaskError('任务不存在或已归档', 404, 'NOT_FOUND')
  assertTaskCollaborationDataScope(scope, task)
  return task
}
export async function bumpTask(tx: Prisma.TransactionClient, id: string, expectedRevision: number, data: Prisma.TaskCollaborationUncheckedUpdateManyInput = {}, archived = false) {
  const changed = await tx.taskCollaboration.updateMany({
    where: { id, revision: expectedRevision, ...(archived ? {} : { deletedAt: null }) },
    data: { ...data, revision: { increment: 1 } },
  })
  if (changed.count !== 1) throw new TaskError('任务已被修改，请刷新后重试', 409, 'VERSION_CONFLICT')
}
function dataForDraft(input: TaskDraftInput) {
  return {
    title: input.title, salesOrderId: input.salesOrderId || null, productionOrderId: input.productionOrderId || null,
    assigneeEmployeeId: input.assigneeEmployeeId || null, supplierId: input.supplierId || null, workCenterId: input.workCenterId || null,
    quantity: input.quantity, unit: input.unit, dueAt: input.dueAt ? new Date(input.dueAt) : null,
    instructions: input.instructions || null, documentRefsJson: JSON.stringify(input.documentRefs),
  }
}
function lineData(input: TaskDraftInput) {
  return input.lines.map((line, sortOrder) => ({
    id: line.id || randomUUID(), materialId: line.materialId, quantity: line.quantity, unit: line.unit,
    note: line.note || null, documentRefsJson: JSON.stringify(line.documentRefs), sortOrder,
  }))
}
export async function createTask(input: TaskDraftInput & { templateTaskId?: string }, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext, inherit?: { lines: boolean; documentRefs: boolean; instructions: boolean }) {
  if (input.templateTaskId) {
    const template = await getTask(input.templateTaskId, scope)
    input = {
      ...input, instructions: (inherit?.instructions ?? input.instructions === undefined) ? template.instructions : input.instructions,
      documentRefs: (inherit?.documentRefs ?? !input.documentRefs.length) ? JSON.parse(template.documentRefsJson) : input.documentRefs,
      lines: (inherit?.lines ?? !input.lines.length) ? template.lines.map(line => ({
        materialId: line.materialId, quantity: line.quantity, unit: line.unit, note: line.note, documentRefs: JSON.parse(line.documentRefsJson),
      })) : input.lines,
    }
  }
  await validateTaskInputAccess(actor, input)
  const id = randomUUID()
  await prisma.$transaction(async tx => {
    await assertTaskReferences(tx, input, scope)
    const task = await tx.taskCollaboration.create({ data: {
      id, taskNo: `TC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      ...dataForDraft(input), createdBy: actor.id, lines: { create: lineData(input).map(({ id: _id, ...line }) => line) },
    } })
    await createAuditLog(tx, audit, { action: 'CREATE', entityType: 'TASK_COLLABORATION', entityId: id, entityLabel: task.taskNo, afterData: input })
  })
  return getTask(id, scope)
}
export async function updateTask(id: string, input: TaskDraftInput & { expectedRevision: number }, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext) {
  await validateTaskInputAccess(actor, input)
  await prisma.$transaction(async tx => {
    const current = await requireTask(tx, id, scope)
    if (!['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(current.status)) throw new TaskError('当前任务状态不可修改', 400, 'INVALID_TRANSITION')
    if (current.status !== 'DRAFT' && !input.assigneeEmployeeId && !input.supplierId && !current.dispatchId) throw new TaskError('已派工任务必须保留负责人或供应商', 400, 'INVALID_REFERENCE')
    if (current.dispatchId && (!input.assigneeEmployeeId || !input.workCenterId || !input.productionOrderId)) throw new TaskError('已关联派工的任务须保留订单、员工和工作中心', 400, 'INVALID_REFERENCE')
    await validateTaskInputAccess(actor, { dispatchId: current.dispatchId })
    await assertTaskReferences(tx, { ...input, dispatchId: current.dispatchId }, scope)
    await bumpTask(tx, id, input.expectedRevision, dataForDraft(input))
    const existingIds = (await tx.taskCollaborationLine.findMany({ where: { taskId: id }, select: { id: true } })).map(line => line.id)
    if (input.lines.some(line => line.id && !existingIds.includes(line.id))) throw new TaskError('BOM行不属于该任务', 400, 'INVALID_REFERENCE')
    await tx.taskCollaborationLine.deleteMany({ where: { taskId: id } })
    for (const line of lineData(input)) await tx.taskCollaborationLine.create({ data: { ...line, taskId: id } })
    await createAuditLog(tx, audit, { action: 'UPDATE', entityType: 'TASK_COLLABORATION', entityId: id, entityLabel: current.taskNo, beforeData: current, afterData: input })
  })
  return getTask(id, scope)
}
export async function assignTask(id: string, input: { expectedRevision: number; dispatchId?: string }, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext) {
  await prisma.$transaction(async tx => {
    const current = await requireTask(tx, id, scope)
    if (current.status !== 'DRAFT') throw new TaskError('只有草稿任务可以派工', 400, 'INVALID_TRANSITION')
    const dispatch = input.dispatchId ? await tx.dispatch.findUnique({ where: { id: input.dispatchId }, include: { step: true } }) : null
    if (input.dispatchId && (!dispatch || dispatch.deletedAt || dispatch.status === 'CANCELLED')) throw new TaskError('派工不存在、已取消或已归档', 400, 'INVALID_REFERENCE')
    if (dispatch && current.assigneeEmployeeId && dispatch.employeeId !== current.assigneeEmployeeId) throw new TaskError('派工与任务负责人不一致', 400, 'INVALID_REFERENCE')
    if (dispatch && current.workCenterId && dispatch.step.workCenterId !== current.workCenterId) throw new TaskError('派工与任务工作中心不一致', 400, 'INVALID_REFERENCE')
    const assignment = { ...current,
      dispatchId: dispatch?.id || null, productionOrderId: dispatch?.orderId || current.productionOrderId,
      assigneeEmployeeId: dispatch?.employeeId || current.assigneeEmployeeId, workCenterId: dispatch?.step.workCenterId || current.workCenterId,
    }
    if (!assignment.assigneeEmployeeId && !assignment.supplierId) throw new TaskError('请选择负责人、供应商或既有派工', 400, 'INVALID_REFERENCE')
    if (dispatch && current.productionOrderId && dispatch.orderId !== current.productionOrderId) throw new TaskError('派工与关联生产订单不一致', 400, 'INVALID_REFERENCE')
    await validateTaskInputAccess(actor, assignment)
    await assertTaskReferences(tx, assignment, scope)
    await bumpTask(tx, id, input.expectedRevision, { status: 'ASSIGNED', dispatchId: assignment.dispatchId,
      productionOrderId: assignment.productionOrderId, assigneeEmployeeId: assignment.assigneeEmployeeId, workCenterId: assignment.workCenterId })
    await createAuditLog(tx, audit, { action: 'ASSIGN', entityType: 'TASK_COLLABORATION', entityId: id, entityLabel: current.taskNo, beforeData: current, afterData: { ...assignment, status: 'ASSIGNED', revision: current.revision + 1 } })
  })
  return getTask(id, scope)
}
export async function appendTaskProgress(id: string, input: { kind: string; note: string; attachmentRefs: TaskFileReference[]; expectedRevision?: number; status?: string }, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext) {
  await validateTaskFileAccess(actor, input.attachmentRefs)
  await prisma.$transaction(async tx => {
    const current = await requireTask(tx, id, scope)
    if (input.status) {
      if (current.productionOrderId || current.dispatchId) throw new TaskError('执行状态由MES维护，协同只能记录备注或异常', 400, 'INVALID_TRANSITION')
      const allowed: Record<string, string[]> = { ASSIGNED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED', 'CANCELLED'] }
      if (!allowed[current.status]?.includes(input.status)) throw new TaskError('无效任务状态流转', 400, 'INVALID_TRANSITION')
      if (!input.expectedRevision) throw new TaskError('状态变更必须提供当前版本', 400, 'VALIDATION_ERROR')
      await bumpTask(tx, id, input.expectedRevision, { status: input.status })
    }
    const progress = await tx.taskCollaborationProgress.create({ data: {
      taskId: id, kind: input.kind, note: input.note, attachmentRefsJson: JSON.stringify(input.attachmentRefs), actorId: actor.id, actorName: actor.name,
    } })
    await createAuditLog(tx, audit, { action: 'PROGRESS', entityType: 'TASK_COLLABORATION', entityId: id, entityLabel: current.taskNo, beforeData: { status: current.status, revision: current.revision }, afterData: { ...progress, status: input.status || current.status, revision: current.revision + (input.status ? 1 : 0) } })
  })
  return getTask(id, scope)
}
export async function archiveOrRestoreTask(id: string, expectedRevision: number, restore: boolean, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext) {
  await prisma.$transaction(async tx => {
    const current = await requireTask(tx, id, scope, true)
    if (restore !== Boolean(current.deletedAt)) throw new TaskError('任务归档状态已变化', 409, 'INVALID_TRANSITION')
    await bumpTask(tx, id, expectedRevision, { deletedAt: restore ? null : new Date(), deletedBy: restore ? null : actor.id }, restore)
    await createAuditLog(tx, audit, { action: restore ? 'RESTORE' : 'ARCHIVE', entityType: 'TASK_COLLABORATION', entityId: id, entityLabel: current.taskNo, beforeData: current })
  })
  return getTask(id, scope)
}
