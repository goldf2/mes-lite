import type { Prisma } from '@prisma/client'
import { withAttachmentUrls } from '@/lib/attachment-urls'
import { prisma } from '@/lib/prisma'
import {
  assertTaskCollaborationDataScope,
  dispatchDataScopeWhere,
  productionOrderDataScopeWhere,
  taskCollaborationDataScopeWhere,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { TaskCollaborationDomainError } from '../domain/task-errors'
import type { TaskDocumentReference } from './task-reference-service'
import { hydrateTaskFileReferenceGroups } from './task-file-reference-service'

const taskRelations = {
  salesOrder: { select: { id: true, orderNo: true, status: true } },
  assigneeEmployee: { select: { id: true, code: true, name: true, isActive: true } },
  supplier: { select: { id: true, code: true, name: true } },
  workCenter: { select: { id: true, code: true, name: true } },
  lines: {
    include: { material: { select: { id: true, code: true, name: true, spec: true, unit: true, stockUnit: true, valuationUnit: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
  progress: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  releases: {
    include: { deliveries: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.TaskCollaborationInclude

type LoadedTask = Prisma.TaskCollaborationGetPayload<{ include: typeof taskRelations }>

function parseStoredJson<T>(value: string | null | undefined, emptyValue: T): T {
  return value ? JSON.parse(value) as T : emptyValue
}

/** Only these scoped production projections may cross into the collaboration response. */
async function executionForTasks(tasks: LoadedTask[], scope: EffectiveDataScope) {
  const referenceGroups = tasks.flatMap((task) => [
    parseStoredJson<TaskDocumentReference[]>(task.documentRefsJson, []),
    ...task.lines.map((line) => parseStoredJson<TaskDocumentReference[]>(line.documentRefsJson, [])),
    ...task.progress.map((entry) => parseStoredJson<TaskDocumentReference[]>(entry.attachmentRefsJson, [])),
  ])
  const hydratedGroups = await hydrateTaskFileReferenceGroups(scope, referenceGroups)
  let referenceGroupIndex = 0
  const dispatchIds = Array.from(new Set(tasks.flatMap((task) => task.dispatchId ? [task.dispatchId] : [])))
  const dispatches = dispatchIds.length ? await prisma.dispatch.findMany({
    where: { id: { in: dispatchIds }, ...dispatchDataScopeWhere(scope) },
    select: { id: true, dispatchNo: true, status: true, planQty: true, employeeId: true, orderId: true, deletedAt: true },
  }) : []
  const byDispatchId = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]))
  const orderIds = Array.from(new Set([
    ...tasks.flatMap((task) => task.productionOrderId ? [task.productionOrderId] : []),
    ...dispatches.map((dispatch) => dispatch.orderId),
  ]))
  const orders = orderIds.length ? await prisma.productionOrder.findMany({
    where: { id: { in: orderIds }, ...productionOrderDataScopeWhere(scope) },
    select: { id: true, orderNo: true, status: true, planQty: true, completeQty: true, scrapQty: true, deletedAt: true },
  }) : []
  const byOrderId = new Map(orders.map((order) => [order.id, order]))
  return tasks.map((task) => {
    const dispatch = task.dispatchId ? byDispatchId.get(task.dispatchId) || null : null
    const orderId = task.productionOrderId || dispatch?.orderId
    const productionOrder = orderId ? byOrderId.get(orderId) || null : null
    const { documentRefsJson, lines, progress, releases, ...record } = task
    const mesLinked = Boolean(task.productionOrderId || task.dispatchId)
    return {
      ...record,
      documentRefsJson,
      documentRefs: hydratedGroups[referenceGroupIndex++],
      lines: lines.map(({ documentRefsJson: lineRefs, ...line }) => ({ ...line, documentRefsJson: lineRefs, documentRefs: hydratedGroups[referenceGroupIndex++] })),
      progress: progress.map(({ attachmentRefsJson, ...item }) => ({ ...item, attachmentRefsJson, attachmentRefs: hydratedGroups[referenceGroupIndex++] })),
      releases: releases.map(({ manifestJson, ...release }) => ({ ...release, manifestJson, manifest: parseStoredJson<Record<string, unknown> | null>(manifestJson, null) })),
      productionOrder,
      dispatch: dispatch ? { id: dispatch.id, dispatchNo: dispatch.dispatchNo, status: dispatch.status, planQty: dispatch.planQty, employeeId: dispatch.employeeId, deletedAt: dispatch.deletedAt } : null,
      execution: {
        source: mesLinked ? 'MES' as const : 'COLLABORATION' as const,
        productionOrder,
        dispatch: dispatch ? { id: dispatch.id, dispatchNo: dispatch.dispatchNo, status: dispatch.status, planQty: dispatch.planQty, employeeId: dispatch.employeeId, deletedAt: dispatch.deletedAt } : null,
        ...(productionOrder ? { completeQty: productionOrder.completeQty, scrapQty: productionOrder.scrapQty } : {}),
        status: mesLinked ? dispatch?.status || productionOrder?.status || null : task.status,
      },
    }
  })
}

export interface TaskListQuery {
  keyword?: string
  status?: string
  archived?: boolean
  page?: number
  pageSize?: number
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(1, Math.floor(value!))) : fallback
}

export async function listTasks(input: TaskListQuery, scope: EffectiveDataScope) {
  const page = boundedInteger(input.page, 1, Number.MAX_SAFE_INTEGER)
  const pageSize = boundedInteger(input.pageSize, 20, 100)
  const keyword = input.keyword?.trim()
  const statuses = input.status?.split(',').map((status) => status.trim()).filter(Boolean) || []
  if (statuses.some((status) => !['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status))) {
    throw new TaskCollaborationDomainError('任务状态筛选无效', 400, 'VALIDATION_ERROR')
  }
  const where: Prisma.TaskCollaborationWhereInput = {
    AND: [
      taskCollaborationDataScopeWhere(scope),
      { deletedAt: input.archived ? { not: null } : null },
      ...(statuses.length ? [{ status: { in: statuses } }] : []),
      ...(keyword ? [{ OR: [
        { taskNo: { contains: keyword } }, { title: { contains: keyword } }, { instructions: { contains: keyword } },
        { supplier: { is: { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } } },
        { assigneeEmployee: { is: { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } } },
      ] }] : []),
    ],
  }
  const [tasks, total] = await Promise.all([
    prisma.taskCollaboration.findMany({ where, include: taskRelations, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.taskCollaboration.count({ where }),
  ])
  return { items: await executionForTasks(tasks, scope), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

/** Archived tasks remain inspectable for history/restore; their files retain the owner's archive guard. */
export async function getTask(id: string, scope: EffectiveDataScope) {
  const task = await prisma.taskCollaboration.findUnique({ where: { id }, include: taskRelations })
  if (!task) throw new TaskCollaborationDomainError('任务不存在', 404, 'NOT_FOUND')
  assertTaskCollaborationDataScope(scope, task)
  return (await executionForTasks([task], scope))[0]
}

export const taskOptionTypes = ['materials', 'employees', 'suppliers', 'orders', 'salesOrders', 'dispatches', 'workCenters', 'files'] as const
export type TaskOptionType = (typeof taskOptionTypes)[number]

/** Caller checks task and source resource permissions; this function enforces row scope and returns minimal identities. */
export async function listTaskOptions(type: TaskOptionType, keyword: string | undefined, scope: EffectiveDataScope, taskId?: string) {
  const text = keyword?.trim()
  if (type === 'materials') {
    const rows = await prisma.material.findMany({
      where: { deletedAt: null, ...(text ? { OR: [{ code: { contains: text } }, { name: { contains: text } }, { spec: { contains: text } }] } : {}) },
      select: { id: true, code: true, name: true, spec: true, unit: true, stockUnit: true, valuationUnit: true },
      orderBy: { code: 'asc' }, take: 50,
    })
    return rows.map((row) => ({ ...row, label: `${row.code} ${row.name}`, allowedUnits: Array.from(new Set([row.unit, row.stockUnit, row.valuationUnit].filter(Boolean))) }))
  }
  if (type === 'employees') {
    const rows = await prisma.employee.findMany({
      where: { isActive: true, ...(scope.productionMode === 'SELF' ? { id: scope.employeeId || '__NO_AUTHORIZED_SCOPE__' } : {}), ...(text ? { OR: [{ code: { contains: text } }, { name: { contains: text } }] } : {}) },
      select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 50,
    })
    return rows.map((row) => ({ ...row, label: `${row.code} ${row.name}` }))
  }
  if (type === 'suppliers') {
    const rows = await prisma.supplier.findMany({
      where: { deletedAt: null, ...(text ? { OR: [{ code: { contains: text } }, { name: { contains: text } }] } : {}) },
      select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 50,
    })
    return rows.map((row) => ({ ...row, label: `${row.code} ${row.name}` }))
  }
  if (type === 'workCenters') {
    const rows = await prisma.workCenter.findMany({
      where: { deletedAt: null, isActive: true, ...(scope.productionMode === 'WORK_CENTERS' ? { id: { in: scope.workCenterIds } } : {}), ...(text ? { OR: [{ code: { contains: text } }, { name: { contains: text } }] } : {}) },
      select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 50,
    })
    return rows.map((row) => ({ ...row, label: `${row.code} ${row.name}` }))
  }
  if (type === 'salesOrders') {
    const rows = await prisma.salesOrder.findMany({
      where: { deletedAt: null, status: { not: 'CANCELLED' }, ...(text ? { OR: [{ orderNo: { contains: text } }, { voucherNo: { contains: text } }] } : {}) },
      select: { id: true, orderNo: true, status: true }, orderBy: { createdAt: 'desc' }, take: 50,
    })
    return rows.map((row) => ({ ...row, label: row.orderNo }))
  }
  if (type === 'orders') {
    const rows = await prisma.productionOrder.findMany({
      where: { deletedAt: null, status: { not: 'CANCELLED' }, AND: [productionOrderDataScopeWhere(scope), ...(text ? [{ OR: [{ orderNo: { contains: text } }, { voucherNo: { contains: text } }] }] : [])] },
      select: { id: true, orderNo: true, status: true, planQty: true }, orderBy: { createdAt: 'desc' }, take: 50,
    })
    return rows.map((row) => ({ ...row, label: row.orderNo }))
  }
  if (type === 'dispatches') {
    const rows = await prisma.dispatch.findMany({
      where: { deletedAt: null, status: { not: 'CANCELLED' }, order: { is: { deletedAt: null, status: { not: 'CANCELLED' } } }, ...dispatchDataScopeWhere(scope), ...(text ? { OR: [{ dispatchNo: { contains: text } }, { workerName: { contains: text } }] } : {}) },
      select: { id: true, dispatchNo: true, orderId: true, employeeId: true, planQty: true, status: true, step: { select: { workCenterId: true } } },
      orderBy: { createdAt: 'desc' }, take: 50,
    })
    return rows.map(({ step, ...row }) => ({ ...row, workCenterId: step.workCenterId, label: row.dispatchNo }))
  }
  if (type === 'files') {
    if (!taskId) return []
    const task = await prisma.taskCollaboration.findFirst({ where: { id: taskId, deletedAt: null, ...taskCollaborationDataScopeWhere(scope) }, select: { id: true } })
    if (!task) throw new TaskCollaborationDomainError('任务不存在或不在当前数据范围内', 404, 'NOT_FOUND')
    const rows = await prisma.documentAttachment.findMany({
      where: { ownerType: 'TASK_COLLABORATION', ownerId: taskId, deletedAt: null, NOT: { documentType: { startsWith: 'SYSTEM_GENERATED_' } }, ...(text ? { originalName: { contains: text } } : {}) },
      select: { id: true, originalName: true, mimeType: true, size: true, rotation: true, previewRevision: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 50,
    })
    return rows.map((row) => ({ ...withAttachmentUrls(row), label: row.originalName }))
  }
  throw new TaskCollaborationDomainError('不支持的任务引用类型', 400, 'VALIDATION_ERROR')
}
