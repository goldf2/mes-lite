import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { EquipmentInput } from '../contracts/equipment-schema'
import { EquipmentDomainError } from '../domain/equipment-errors'
import { equipmentWriteData } from '../domain/equipment-rules'
import { equipmentInclude } from './equipment-query-service'

async function runEquipmentCommand<T>(operation: () => Promise<T>, duplicateMessage: string) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof EquipmentDomainError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new EquipmentDomainError(duplicateMessage, 409)
    }
    throw error
  }
}

async function assertActiveWorkCenter(tx: Prisma.TransactionClient, id: string) {
  const workCenter = await tx.workCenter.findFirst({
    where: { id, isActive: true, deletedAt: null }, select: { id: true },
  })
  if (!workCenter) throw new EquipmentDomainError('工作中心不存在或已停用')
}

export async function createManagedEquipment(input: EquipmentInput) {
  return runEquipmentCommand(() => prisma.$transaction(async (tx) => {
    await assertActiveWorkCenter(tx, input.workCenterId)
    return tx.equipment.create({ data: equipmentWriteData(input), include: equipmentInclude })
  }), '设备编码已存在')
}

export async function updateManagedEquipment(id: string, input: EquipmentInput) {
  return runEquipmentCommand(() => prisma.$transaction(async (tx) => {
    const existing = await tx.equipment.findUnique({ where: { id }, include: equipmentInclude })
    if (!existing || existing.deletedAt) throw new EquipmentDomainError('设备不存在或已归档', 404)
    await assertActiveWorkCenter(tx, input.workCenterId)
    const saved = await tx.equipment.update({
      where: { id }, data: equipmentWriteData(input), include: equipmentInclude,
    })
    return { existing, saved }
  }), '设备编码已存在')
}

export async function archiveManagedEquipment(id: string, archivedAt = new Date()) {
  return runEquipmentCommand(() => prisma.$transaction(async (tx) => {
    const existing = await tx.equipment.findUnique({ where: { id }, include: equipmentInclude })
    if (!existing || existing.deletedAt) throw new EquipmentDomainError('设备不存在或已归档', 404)
    const saved = await tx.equipment.update({
      where: { id }, data: { deletedAt: archivedAt, status: 'STOPPED' }, include: equipmentInclude,
    })
    return { existing, saved }
  }), '设备编码已存在')
}
