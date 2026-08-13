import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { EffectiveDataScope } from '@/modules/identity-access'
import type { ArchiveModel } from '../contracts/maintenance'
import { archiveDataScopeWhere } from './archive-data-scope-service'

export async function listArchivedRecords(
  model: ArchiveModel | 'all',
  allowedModels: readonly ArchiveModel[],
  scope: EffectiveDataScope,
) {
  const result: Record<string, unknown[]> = {}
  const allows = (candidate: ArchiveModel) => allowedModels.includes(candidate) && (model === 'all' || model === candidate)
  if (allows('material')) result.materials = await prisma.material.findMany({ where: { deletedAt: { not: null } }, select: { id: true, code: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('supplier')) result.suppliers = await prisma.supplier.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('customer')) result.customers = await prisma.customer.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('materialIn')) result.materialIn = await prisma.materialReceipt.findMany({ where: { deletedAt: { not: null }, ...archiveDataScopeWhere('materialIn', scope) }, select: { id: true, inboundNo: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('workInstruction')) result.workInstructions = await prisma.workInstruction.findMany({ where: { deletedAt: { not: null } }, select: { id: true, deletedAt: true, material: { select: { code: true, name: true } } }, orderBy: { deletedAt: 'desc' } })
  if (allows('order')) result.orders = await prisma.productionOrder.findMany({ where: { deletedAt: { not: null }, ...archiveDataScopeWhere('order', scope) }, select: { id: true, orderNo: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('dispatch')) result.dispatches = await prisma.dispatch.findMany({ where: { deletedAt: { not: null }, ...archiveDataScopeWhere('dispatch', scope) }, select: { id: true, dispatchNo: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('shipment')) result.shipments = await prisma.shipment.findMany({ where: { deletedAt: { not: null }, ...archiveDataScopeWhere('shipment', scope) }, select: { id: true, shipmentNo: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  if (allows('return')) result.returns = await prisma.returnOrder.findMany({ where: { deletedAt: { not: null }, ...archiveDataScopeWhere('return', scope) }, select: { id: true, returnNo: true, deletedAt: true }, orderBy: { deletedAt: 'desc' } })
  return result
}

export async function listAuditLogs(query: { entityType?: string | null; entityId?: string | null; page: number; pageSize: number }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
  }
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.auditLog.count({ where }),
  ])
  return { data, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } }
}
