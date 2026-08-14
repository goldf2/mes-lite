import type { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { hasResourcePermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getCurrentOperator } from '@/lib/auth'
import {
  dispatchDataScopeWhere,
  flowTransferDataScopeWhere,
  loadEffectiveDataScope,
  materialReceiptDataScopeWhere,
  productionOrderDataScopeWhere,
  qualityInspectionDataScopeWhere,
  returnDataScopeWhere,
  shipmentDataScopeWhere,
  type EffectiveDataScope,
} from '@/modules/identity-access'
import { AttachmentDomainError } from '../domain/attachment-errors'
import {
  resolveAttachmentOwnerContext,
  type AttachmentOwnerContext,
  type AttachmentOwnerType,
} from '../domain/attachment-policy'
import { requireActiveAttachment } from './attachment-query-service'

export type AttachmentAccessOperation = 'read' | 'upload' | 'update' | 'archive' | 'finalize' | 'discard'

type AuthenticatedOperator = PermissionSubject & {
  id: string
  username: string
  name: string
}

type AttachmentRecord = Awaited<ReturnType<typeof requireActiveAttachment>>

const attachmentPermissionAction: Record<AttachmentAccessOperation, PermissionAction> = {
  read: 'read',
  upload: 'create',
  update: 'read',
  archive: 'delete',
  finalize: 'update',
  discard: 'delete',
}

function ownerPermissionAction(operation: AttachmentAccessOperation, draft: boolean): PermissionAction {
  if (operation === 'read') return draft ? 'create' : 'read'
  if (operation === 'upload') return draft ? 'create' : 'update'
  if (operation === 'finalize' || operation === 'discard') return 'create'
  return 'update'
}

async function attachmentOwnerExists(ownerType: AttachmentOwnerType, ownerId: string, scope: EffectiveDataScope) {
  if (ownerType === 'MATERIAL') {
    return Boolean(await prisma.material.findFirst({ where: { id: ownerId, deletedAt: null }, select: { id: true } }))
  }
  if (ownerType === 'WORK_INSTRUCTION') {
    return Boolean(await prisma.workInstruction.findFirst({ where: { id: ownerId, deletedAt: null }, select: { id: true } }))
  }
  if (ownerType === 'MATERIAL_IN') {
    return Boolean(await prisma.materialReceipt.findFirst({
      where: { id: ownerId, deletedAt: null, ...materialReceiptDataScopeWhere(scope) }, select: { id: true },
    }))
  }
  if (ownerType === 'PRODUCTION_ORDER') {
    return Boolean(await prisma.productionOrder.findFirst({
      where: { id: ownerId, deletedAt: null, ...productionOrderDataScopeWhere(scope) }, select: { id: true },
    }))
  }
  if (ownerType === 'DISPATCH') {
    return Boolean(await prisma.dispatch.findFirst({
      where: { id: ownerId, deletedAt: null, ...dispatchDataScopeWhere(scope) }, select: { id: true },
    }))
  }
  if (ownerType === 'SALES_ORDER') {
    return Boolean(await prisma.salesOrder.findFirst({ where: { id: ownerId, deletedAt: null }, select: { id: true } }))
  }
  if (ownerType === 'SHIPMENT') {
    return Boolean(await prisma.shipment.findFirst({
      where: { id: ownerId, deletedAt: null, ...shipmentDataScopeWhere(scope) }, select: { id: true },
    }))
  }
  if (ownerType === 'RETURN_ORDER') {
    return Boolean(await prisma.returnOrder.findFirst({
      where: { id: ownerId, deletedAt: null, ...returnDataScopeWhere(scope) }, select: { id: true },
    }))
  }
  if (ownerType === 'EQUIPMENT_INSPECTION_RECORD') {
    const workCenterIds = scope.productionMode === 'WORK_CENTERS' ? scope.workCenterIds : []
    return Boolean(await prisma.equipmentInspectionRecord.findFirst({
      where: {
        id: ownerId,
        ...(scope.productionMode === 'ALL' ? {} : scope.productionMode === 'WORK_CENTERS'
          ? { equipment: { is: { workCenterId: { in: workCenterIds.length > 0 ? workCenterIds : ['__NO_AUTHORIZED_SCOPE__'] } } } }
          : { id: '__SELF_SCOPE_HAS_NO_EQUIPMENT_ASSIGNMENT__' }),
      },
      select: { id: true },
    }))
  }
  if (ownerType === 'EQUIPMENT_MAINTENANCE_WORK_ORDER') {
    const workCenterIds = scope.productionMode === 'WORK_CENTERS' ? scope.workCenterIds : []
    return Boolean(await prisma.equipmentMaintenanceWorkOrder.findFirst({
      where: {
        id: ownerId,
        ...(scope.productionMode === 'ALL' ? {} : scope.productionMode === 'WORK_CENTERS'
          ? { equipment: { is: { workCenterId: { in: workCenterIds.length > 0 ? workCenterIds : ['__NO_AUTHORIZED_SCOPE__'] } } } }
          : { id: '__SELF_SCOPE_HAS_NO_EQUIPMENT_ASSIGNMENT__' }),
      },
      select: { id: true },
    }))
  }
  if (ownerType === 'QUALITY_INSPECTION') {
    return Boolean(await prisma.qualityInspection.findFirst({
      where: { id: ownerId, ...qualityInspectionDataScopeWhere(scope) }, select: { id: true },
    }))
  }
  return Boolean(await prisma.flowTransfer.findFirst({
    where: { id: ownerId, ...flowTransferDataScopeWhere(scope) }, select: { id: true },
  }))
}

function requireSupportedOwner(ownerType: string) {
  const context = resolveAttachmentOwnerContext(ownerType)
  if (!context) throw new AttachmentDomainError('不支持的附件所属业务类型', 400)
  return context
}

async function requireOperator() {
  const operator = await getCurrentOperator()
  if (!operator) throw new AttachmentDomainError('请先登录', 401)
  return operator
}

async function requirePermission(
  operator: AuthenticatedOperator,
  context: AttachmentOwnerContext,
  operation: AttachmentAccessOperation,
) {
  const [attachmentAllowed, ownerAllowed] = await Promise.all([
    hasResourcePermission(operator, 'attachments', attachmentPermissionAction[operation]),
    hasResourcePermission(operator, context.resource, ownerPermissionAction(operation, context.draft)),
  ])
  if (!attachmentAllowed || !ownerAllowed) throw new AttachmentDomainError('无权访问该业务对象的附件', 403)
}

async function requireOwner(
  operator: AuthenticatedOperator,
  ownerType: string,
  ownerId: string,
  operation: AttachmentAccessOperation,
  attachment?: AttachmentRecord,
) {
  const context = requireSupportedOwner(ownerType)
  await requirePermission(operator, context, operation)

  if (context.draft) {
    if (!ownerId.startsWith('draft-')) throw new AttachmentDomainError('暂存附件标识无效', 400)
    if (attachment && attachment.uploadedBy !== operator.id) {
      throw new AttachmentDomainError('附件不存在或无权访问', 404)
    }
  } else if (!(await attachmentOwnerExists(context.targetOwnerType, ownerId, await loadEffectiveDataScope(operator)))) {
    throw new AttachmentDomainError('附件所属业务对象不存在或已归档', 404)
  }

  if (attachment && (attachment.ownerType !== ownerType || attachment.ownerId !== ownerId)) {
    throw new AttachmentDomainError('附件所属业务对象不匹配', 404)
  }
  return context
}

export async function requireManagedAttachmentOwnerAccess(
  ownerType: string,
  ownerId: string,
  operation: AttachmentAccessOperation,
) {
  const operator = await requireOperator()
  const context = await requireOwner(operator, ownerType, ownerId, operation)
  return { operator, context }
}

export async function requireManagedAttachmentOwnerAccessForOperator(
  operator: AuthenticatedOperator | null,
  ownerType: string,
  ownerId: string,
  operation: AttachmentAccessOperation,
) {
  if (!operator) throw new AttachmentDomainError('请先登录', 401)
  const context = await requireOwner(operator, ownerType, ownerId, operation)
  return { context }
}

export async function requireManagedAttachmentAccess(id: string, operation: AttachmentAccessOperation) {
  const operator = await requireOperator()
  const attachment = await requireActiveAttachment(id)
  const context = await requireOwner(operator, attachment.ownerType, attachment.ownerId, operation, attachment)
  return { operator, attachment, context }
}

export async function requireManagedAttachmentAccessForOperator(
  operator: AuthenticatedOperator | null,
  id: string,
  operation: AttachmentAccessOperation,
) {
  if (!operator) throw new AttachmentDomainError('请先登录', 401)
  const attachment = await requireActiveAttachment(id)
  const context = await requireOwner(operator, attachment.ownerType, attachment.ownerId, operation, attachment)
  return { attachment, context }
}
