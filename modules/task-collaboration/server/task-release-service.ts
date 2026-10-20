import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog, type AuditContext } from '@/lib/audit-core'
import { inspectTaskReleaseFiles, prepareTaskReleaseFiles } from '@/modules/attachments/server-index'
import type { EffectiveDataScope } from '@/modules/identity-access'
import type { TaskRecipient } from '../contracts/task-schema'
import { TaskCollaborationDomainError as TaskError } from '../domain/task-errors'
import { getTask } from './task-query-service'
import { assertTaskReferences } from './task-reference-service'
import { requireTask, validateTaskInputAccess, type TaskActor } from './task-command-service'

type PreviewInput = { expectedRevision: number; recipient: TaskRecipient }
function releaseView<T extends { manifestJson: string }>(release: T) { return { ...release, manifest: JSON.parse(release.manifestJson) } }
function fileRefs(task: Awaited<ReturnType<typeof getTask>>) {
  return [
    ...task.documentRefs.map(({ attachmentId, versionLabel }) => ({ attachmentId, versionLabel, bomLineId: null })),
    ...task.lines.flatMap(line => line.documentRefs.map(({ attachmentId, versionLabel }) => ({ attachmentId, versionLabel, bomLineId: line.id }))),
  ]
}
function checkReleaseTask(task: Awaited<ReturnType<typeof getTask>>, expectedRevision: number) {
  if (task.deletedAt) throw new TaskError('任务已归档', 404, 'NOT_FOUND')
  if (task.revision !== expectedRevision) throw new TaskError('任务已被修改，请重新预览', 409, 'VERSION_CONFLICT')
  if (task.status === 'DRAFT' || task.status === 'CANCELLED') throw new TaskError('请先完成派工，取消任务不可发布', 400, 'INVALID_TRANSITION')
}
function canonicalRecipient(task: Awaited<ReturnType<typeof getTask>>, recipient: TaskRecipient) {
  if (recipient.kind === 'EMPLOYEE') {
    if (!task.assigneeEmployee || recipient.id !== task.assigneeEmployeeId) throw new TaskError('收件员工必须与任务负责人一致')
    return { kind: recipient.kind, id: recipient.id, name: task.assigneeEmployee.name }
  }
  if (recipient.kind === 'SUPPLIER') {
    if (!task.supplier || recipient.id !== task.supplierId) throw new TaskError('收件供应商必须与任务供应商一致')
    return { kind: recipient.kind, id: recipient.id, name: task.supplier.name }
  }
  return { kind: recipient.kind, name: recipient.name }
}
function taskSnapshot(task: Awaited<ReturnType<typeof getTask>>) {
  return {
    id: task.id, taskNo: task.taskNo, title: task.title, status: task.status, revision: task.revision,
    salesOrderId: task.salesOrderId, productionOrderId: task.productionOrderId, dispatchId: task.dispatchId,
    assigneeEmployee: task.assigneeEmployee, supplier: task.supplier, workCenter: task.workCenter,
    quantity: task.quantity, unit: task.unit, dueAt: task.dueAt, instructions: task.instructions,
    documentRefs: task.documentRefs.map(({ attachmentId, versionLabel }) => ({ attachmentId, ...(versionLabel !== undefined ? { versionLabel } : {}) })),
    lines: task.lines.map(line => ({ id: line.id, materialId: line.materialId, material: line.material,
      quantity: line.quantity, unit: line.unit, note: line.note, documentRefs: line.documentRefs.map(({ attachmentId, versionLabel }) => ({ attachmentId, ...(versionLabel !== undefined ? { versionLabel } : {}) })) })),
  }
}
function manifestToken(manifest: { task: unknown; recipient: unknown; files: Array<{attachmentId: string}> }) {
  // Freeze the preview decision: copied IDs are allocated only at commit time.
  const files = manifest.files.map(({ attachmentId: _id, ...file }) => file)
  return createHash('sha256').update(JSON.stringify({ task: manifest.task, recipient: manifest.recipient, files })).digest('hex')
}
export async function previewTaskRelease(id: string, input: PreviewInput, actor: TaskActor, scope: EffectiveDataScope) {
  const task = await getTask(id, scope)
  checkReleaseTask(task, input.expectedRevision)
  await validateTaskInputAccess(actor, task)
  await prisma.$transaction(tx => assertTaskReferences(tx, task, scope))
  const manifest = { revision: task.revision, task: taskSnapshot(task), recipient: canonicalRecipient(task, input.recipient),
    files: await inspectTaskReleaseFiles(actor, id, fileRefs(task)), execution: task.execution }
  return { ...manifest, previewToken: manifestToken(manifest) }
}
export async function publishTaskRelease(id: string, input: PreviewInput & { operationId: string; previewToken: string }, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext) {
  const task = await getTask(id, scope)
  const existing = await prisma.taskCollaborationRelease.findUnique({ where: { operationId: input.operationId }, include: { deliveries: true } })
  if (existing) {
    const saved = JSON.parse(existing.manifestJson)
    const sameRecipient = saved.recipient.kind === input.recipient.kind && (input.recipient.kind === 'INTERNAL' ? saved.recipient.name === input.recipient.name : saved.recipient.id === input.recipient.id)
    if (existing.taskId !== id || existing.revision !== input.expectedRevision || saved.previewToken !== input.previewToken || !sameRecipient) {
      throw new TaskError('重复操作标识对应不同发布内容', 409, 'IDEMPOTENCY_CONFLICT')
    }
    return releaseView(existing)
  }
  checkReleaseTask(task, input.expectedRevision)
  await validateTaskInputAccess(actor, task)
  const recipient = canonicalRecipient(task, input.recipient)
  const prepared = await prepareTaskReleaseFiles(actor, id, fileRefs(task))
  const manifest = { revision: task.revision, task: taskSnapshot(task), recipient,
    files: prepared.manifestFiles, execution: task.execution }
  const token = manifestToken(manifest)
  if (token !== input.previewToken) { await prepared.cleanup(); throw new TaskError('资料或版本已变化，请重新预览后发布', 409, 'VERSION_CONFLICT') }
  try {
    const release = await prisma.$transaction(async tx => {
      const current = await requireTask(tx, id, scope)
      if (current.revision !== input.expectedRevision) throw new TaskError('任务已变化，请重新预览', 409, 'VERSION_CONFLICT')
      await assertTaskReferences(tx, task, scope)
      const prior = await tx.taskCollaborationRelease.findUnique({ where: { taskId_revision: { taskId: id, revision: current.revision } } })
      if (prior) throw new TaskError('该任务版本已经发布，请查看发布历史', 409, 'ALREADY_RELEASED')
      // Re-check revision under the same write transaction that freezes the release.
      const locked = await tx.taskCollaboration.updateMany({ where: { id, revision: input.expectedRevision, deletedAt: null }, data: { updatedAt: new Date() } })
      if (locked.count !== 1) throw new TaskError('任务已变化，请重新预览', 409, 'VERSION_CONFLICT')
      for (const data of prepared.attachments) await tx.documentAttachment.create({ data })
      const created = await tx.taskCollaborationRelease.create({ data: {
        taskId: id, revision: current.revision, operationId: input.operationId,
        manifestJson: JSON.stringify({ ...manifest, execution: { source: task.execution.source, productionOrderId: task.productionOrderId, dispatchId: task.dispatchId }, previewToken: token }), createdBy: actor.id,
      }, include: { deliveries: true } })
      await createAuditLog(tx, audit, { action: 'PUBLISH', entityType: 'TASK_COLLABORATION', entityId: id, entityLabel: task.taskNo, afterData: { releaseId: created.id, revision: current.revision, recipient: manifest.recipient, files: manifest.files } })
      return created
    }, { timeout: 15000 })
    return releaseView(release)
  } catch (error) {
    await prepared.cleanup()
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      const winner = await prisma.taskCollaborationRelease.findUnique({ where: { operationId: input.operationId }, include: { deliveries: true } })
      if (winner?.taskId === id && winner.revision === input.expectedRevision && JSON.parse(winner.manifestJson).previewToken === token) return releaseView(winner)
      throw new TaskError('该任务版本已经发布或已被修改', 409, 'ALREADY_RELEASED')
    }
    throw error
  }
}
export async function getTaskRelease(id: string, releaseId: string, scope: EffectiveDataScope) {
  await getTask(id, scope)
  const release = await prisma.taskCollaborationRelease.findFirst({ where: { id: releaseId, taskId: id }, include: { deliveries: { orderBy: { createdAt: 'asc' } } } })
  if (!release) throw new TaskError('发布记录不存在', 404, 'NOT_FOUND')
  return releaseView(release)
}
export async function recordTaskDelivery(id: string, releaseId: string, input: { operationId: string; method: string; status: string; note?: string | null }, actor: TaskActor, scope: EffectiveDataScope, audit: AuditContext) {
  const release = await getTaskRelease(id, releaseId, scope)
  return prisma.$transaction(async tx => {
    await requireTask(tx, id, scope)
    const existing = await tx.taskCollaborationDelivery.findUnique({ where: { operationId: input.operationId } })
    if (existing) {
      if (existing.releaseId !== releaseId || existing.method !== input.method || existing.status !== input.status || existing.note !== (input.note || null)) throw new TaskError('重复操作标识对应不同发放记录', 409, 'IDEMPOTENCY_CONFLICT')
      return existing
    }
    const delivery = await tx.taskCollaborationDelivery.create({ data: {
      ...input, note: input.note || null, releaseId, recipientName: release.manifest.recipient.name, actorId: actor.id,
    } })
    await createAuditLog(tx, audit, { action: 'DELIVERY', entityType: 'TASK_COLLABORATION', entityId: id, afterData: delivery })
    return delivery
  })
}
