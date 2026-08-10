import type { ArchiveModel } from '../contracts/maintenance'
import { prisma } from '@/lib/prisma'
import { SOFT_DELETE_MODELS } from './soft-delete-models'

export class ArchivedRecordRestoreError extends Error {
  constructor(message: string, public readonly status: 404) {
    super(message)
    this.name = 'ArchivedRecordRestoreError'
  }
}

export async function restoreArchivedRecord(model: ArchiveModel, id: string) {
  const config = SOFT_DELETE_MODELS[model]
  if (model === 'materialIn') {
    return prisma.$transaction(async (tx) => {
      const before = await tx.materialReceipt.findUnique({ where: { id } })
      if (!before) throw new ArchivedRecordRestoreError('记录不存在', 404)
      const restored = await tx.materialReceipt.update({ where: { id }, data: { deletedAt: null, deletedBy: null } })
      await tx.materialIn.updateMany({ where: { receiptId: id }, data: { deletedAt: null, deletedBy: null } })
      return { before, restored, entityType: config.entityType, entityLabel: restored.inboundNo }
    })
  }
  const delegate = config.delegate as any
  const before = await delegate.findUnique({ where: { id } })
  if (!before) throw new ArchivedRecordRestoreError('记录不存在', 404)
  const restored = await delegate.update({ where: { id }, data: { deletedAt: null, deletedBy: null } })
  return {
    before,
    restored,
    entityType: config.entityType,
    entityLabel: restored[config.labelField] as string,
  }
}
