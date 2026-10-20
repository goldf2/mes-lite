import type { Prisma } from '@prisma/client'
import type { AttachmentPreviewKind } from '@/lib/attachment-file-types'
import {
  assertTaskCollaborationDataScope,
  assertDispatchDataScope,
  DataScopeError,
  productionOrderDataScopeWhere,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { TaskCollaborationDomainError } from '../domain/task-errors'

export interface TaskDocumentReference {
  attachmentId: string
  versionLabel?: string
  originalName?: string
  mimeType?: string
  size?: number
  rotation?: number
  previewRevision?: number
  previewKind?: AttachmentPreviewKind
  url?: string
  originalUrl?: string
  previewUrl?: string
  thumbnailUrl?: string | null
  fileUnavailable?: boolean
}

export interface TaskReferenceLine {
  materialId: string
  quantity: number
  unit: string
  documentRefs?: TaskDocumentReference[]
  documentRefsJson?: string | null
}

export interface TaskReferenceInput {
  salesOrderId?: string | null
  productionOrderId?: string | null
  dispatchId?: string | null
  assigneeEmployeeId?: string | null
  supplierId?: string | null
  workCenterId?: string | null
  quantity?: number
  unit?: string
  documentRefs?: TaskDocumentReference[]
  documentRefsJson?: string | null
  lines?: TaskReferenceLine[]
}

function invalidReference(message: string): never {
  throw new TaskCollaborationDomainError(message, 400, 'INVALID_REFERENCE')
}

function documentReferences(input: Pick<TaskReferenceInput, 'documentRefs' | 'documentRefsJson'>): TaskDocumentReference[] {
  if (!input.documentRefs && !input.documentRefsJson) return []
  try {
    const references: unknown = input.documentRefs || JSON.parse(input.documentRefsJson!)
    if (!Array.isArray(references) || references.some((reference) => (
      !reference || typeof reference !== 'object' || typeof reference.attachmentId !== 'string' || !reference.attachmentId
    ))) invalidReference('任务文件引用格式无效')
    return references as TaskDocumentReference[]
  } catch (error) {
    if (error instanceof TaskCollaborationDomainError) throw error
    return invalidReference('任务文件引用格式无效')
  }
}

/** Validate identities inside the caller's transaction; this never creates master data or production documents. */
export async function assertTaskReferences(tx: Prisma.TransactionClient, input: TaskReferenceInput, scope: EffectiveDataScope): Promise<void> {
  assertTaskCollaborationDataScope(scope, input)
  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || input.quantity <= 0)) {
    invalidReference('任务数量必须为大于 0 的有限数字')
  }
  if (input.unit !== undefined && (!input.unit.trim() || input.unit.trim().length > 30)) invalidReference('任务单位无效')

  if (input.assigneeEmployeeId) {
    const employee = await tx.employee.findFirst({ where: { id: input.assigneeEmployeeId, isActive: true }, select: { id: true } })
    if (!employee) invalidReference('负责人不存在或已停用')
  }
  if (input.supplierId) {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null }, select: { id: true } })
    if (!supplier) invalidReference('供应商不存在或已归档')
  }
  if (input.workCenterId) {
    const workCenter = await tx.workCenter.findFirst({ where: { id: input.workCenterId, isActive: true, deletedAt: null }, select: { id: true } })
    if (!workCenter) invalidReference('工作中心不存在、已停用或已归档')
  }
  if (input.salesOrderId) {
    const salesOrder = await tx.salesOrder.findFirst({ where: { id: input.salesOrderId, deletedAt: null }, select: { id: true, status: true } })
    if (!salesOrder || salesOrder.status === 'CANCELLED') invalidReference('销售订单不存在、已归档或已取消')
  }

  let orderId = input.productionOrderId
  if (input.dispatchId) {
    const dispatch = await tx.dispatch.findFirst({
      where: { id: input.dispatchId, deletedAt: null },
      select: { orderId: true, employeeId: true, status: true, step: { select: { workCenterId: true } } },
    })
    if (!dispatch) invalidReference('派工单不存在或已归档')
    assertDispatchDataScope(scope, dispatch)
    if (dispatch.status === 'CANCELLED') invalidReference('已取消的派工单不能关联任务')
    if (orderId && orderId !== dispatch.orderId) invalidReference('派工单不属于所选生产订单')
    if (input.assigneeEmployeeId && input.assigneeEmployeeId !== dispatch.employeeId) invalidReference('任务负责人必须与所选派工单员工一致')
    if (input.workCenterId && input.workCenterId !== dispatch.step.workCenterId) invalidReference('任务工作中心必须与所选派工工序一致')
    orderId = dispatch.orderId
  }
  if (orderId) {
    const order = await tx.productionOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, status: true },
    })
    if (!order || order.status === 'CANCELLED') invalidReference('生产订单不存在、已归档或已取消')
    if (scope.productionMode !== 'ALL') {
      const authorized = await tx.productionOrder.findFirst({ where: { id: orderId, ...productionOrderDataScopeWhere(scope) }, select: { id: true } })
      if (!authorized) throw new DataScopeError('生产订单不在当前账号的生产数据范围内')
    }
  }

  const lines = input.lines || []
  const materialIds = Array.from(new Set(lines.map((line) => line.materialId)))
  const materials = materialIds.length ? await tx.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
    select: { id: true, unit: true, stockUnit: true, valuationUnit: true },
  }) : []
  if (materials.length !== materialIds.length) invalidReference('任务 BOM 中存在无效或已归档物料')
  const byId = new Map(materials.map((material) => [material.id, material]))
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) invalidReference('任务 BOM 数量必须为大于 0 的有限数字')
    const material = byId.get(line.materialId)!
    const allowedUnits = [material.unit, material.stockUnit, material.valuationUnit].filter(Boolean)
    if (!line.unit || line.unit !== line.unit.trim() || !allowedUnits.includes(line.unit)) {
      invalidReference('任务 BOM 单位必须使用所选物料的业务单位、库存单位或计价单位')
    }
  }

  const references = [
    ...documentReferences(input),
    ...lines.flatMap((line) => documentReferences(line)),
  ]
  const attachmentIds = Array.from(new Set(references.map((reference) => reference.attachmentId)))
  if (attachmentIds.length) {
    const count = await tx.documentAttachment.count({ where: { id: { in: attachmentIds }, deletedAt: null } })
    if (count !== attachmentIds.length) throw new TaskCollaborationDomainError('任务资料中存在失效或已归档文件', 404, 'FILE_UNAVAILABLE')
  }
}
