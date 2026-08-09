import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ArchiveModel } from '../contracts/maintenance'

export async function listArchivedRecords(model: ArchiveModel | 'all') {
  const result: Record<string, unknown[]> = {}
  if (model === 'all' || model === 'material') result.materials = await prisma.material.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'supplier') result.suppliers = await prisma.supplier.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'customer') result.customers = await prisma.customer.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'materialIn') result.materialIn = await prisma.materialIn.findMany({ where: { deletedAt: { not: null } }, include: { supplier: true, material: true }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'workInstruction') result.workInstructions = await prisma.workInstruction.findMany({ where: { deletedAt: { not: null } }, include: { material: true }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'order') result.orders = await prisma.productionOrder.findMany({ where: { deletedAt: { not: null } }, include: { product: true }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'dispatch') result.dispatches = await prisma.dispatch.findMany({ where: { deletedAt: { not: null } }, include: { order: true, step: true }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'shipment') result.shipments = await prisma.shipment.findMany({ where: { deletedAt: { not: null } }, include: { product: true }, orderBy: { deletedAt: 'desc' } })
  if (model === 'all' || model === 'return') result.returns = await prisma.returnOrder.findMany({ where: { deletedAt: { not: null } }, include: { product: true }, orderBy: { deletedAt: 'desc' } })
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
