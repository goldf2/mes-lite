import { Prisma } from '@prisma/client'
import { nextConfigurationSortOrder } from '@/lib/configuration-order'
import { prisma } from '@/lib/prisma'
import type { WorkCenterInput, WorkCenterUpdateInput } from '../contracts/work-center-schema'
import { EquipmentDomainError } from '../domain/equipment-errors'
import { assertWorkCenterUpdateAllowed, normalizeEquipmentCode } from '../domain/equipment-rules'

async function runWorkCenterCommand<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof EquipmentDomainError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new EquipmentDomainError('工作中心编码已存在', 409)
    }
    throw error
  }
}

export async function createManagedWorkCenter(input: WorkCenterInput) {
  return runWorkCenterCommand(() => prisma.$transaction(async (tx) => tx.workCenter.create({
    data: {
      code: normalizeEquipmentCode(input.code),
      name: input.name.trim(),
      category: input.category?.trim() || null,
      note: input.note?.trim() || null,
      isActive: input.isActive ?? true,
      sortOrder: await nextConfigurationSortOrder(tx, 'workCenters'),
    },
  })))
}

export async function updateManagedWorkCenter(input: WorkCenterUpdateInput) {
  return runWorkCenterCommand(() => prisma.$transaction(async (tx) => {
    const existing = await tx.workCenter.findUnique({ where: { id: input.id } })
    if (!existing) throw new EquipmentDomainError('工作中心不存在', 404)
    assertWorkCenterUpdateAllowed(existing, input)
    const saved = await tx.workCenter.update({
      where: { id: input.id },
      data: {
        ...(input.code === undefined ? {} : { code: normalizeEquipmentCode(input.code) }),
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.category === undefined ? {} : { category: input.category?.trim() || null }),
        ...(input.note === undefined ? {} : { note: input.note?.trim() || null }),
        ...(input.isActive === undefined ? {} : {
          isActive: input.isActive,
          deletedAt: input.isActive ? null : existing.deletedAt,
        }),
      },
    })
    return { existing, saved }
  }))
}

export async function archiveManagedWorkCenter(id: string, archivedAt = new Date()) {
  return runWorkCenterCommand(() => prisma.$transaction(async (tx) => {
    const existing = await tx.workCenter.findUnique({
      where: { id }, include: { _count: { select: { equipment: true } } },
    })
    if (!existing || existing.deletedAt) throw new EquipmentDomainError('工作中心不存在或已归档', 404)
    if (existing._count.equipment > 0) {
      throw new EquipmentDomainError('工作中心仍有设备引用，请先调整设备归属', 409)
    }
    const saved = await tx.workCenter.update({
      where: { id }, data: { isActive: false, deletedAt: archivedAt },
    })
    return { existing, saved }
  }))
}
