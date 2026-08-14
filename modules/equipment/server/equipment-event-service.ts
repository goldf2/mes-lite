import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { EquipmentEventCommand } from '../contracts/equipment-event-schema'
import { EquipmentDomainError } from '../domain/equipment-errors'
import { resolveEquipmentTransition } from '../domain/equipment-event-rules'
import { equipmentInclude } from './equipment-query-service'

export interface EquipmentEventActor {
  operatorId?: string | null
  operatorName: string
}

export async function closeLatestEquipmentIncident(
  tx: Prisma.TransactionClient,
  equipmentId: string,
  status: string,
  endedAt: Date,
) {
  if (!['FAULT', 'MAINTENANCE', 'STOPPED'].includes(status)) return null
  const event = await tx.equipmentEvent.findFirst({
    where: { equipmentId, targetStatus: status, endedAt: null },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  })
  if (!event) return null
  const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - event.occurredAt.getTime()) / 1000))
  return tx.equipmentEvent.update({
    where: { id: event.id }, data: { endedAt, durationSeconds },
  })
}

export async function listEquipmentEvents(equipmentId: string) {
  const equipment = await prisma.equipment.findFirst({ where: { id: equipmentId, deletedAt: null }, select: { id: true } })
  if (!equipment) throw new EquipmentDomainError('设备不存在或已归档', 404)
  return prisma.equipmentEvent.findMany({
    where: { equipmentId },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
}

export async function recordEquipmentEvent(
  equipmentId: string,
  input: EquipmentEventCommand,
  actor: EquipmentEventActor,
  occurredAt = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.equipment.findUnique({ where: { id: equipmentId } })
    if (!existing || existing.deletedAt) throw new EquipmentDomainError('设备不存在或已归档', 404)
    const { sourceStatus, targetStatus } = resolveEquipmentTransition(existing.status, input.action)
    if (input.action === 'RECOVER' || input.action === 'MAINTAIN') {
      await closeLatestEquipmentIncident(tx, equipmentId, sourceStatus, occurredAt)
    }
    const event = await tx.equipmentEvent.create({
      data: {
        equipmentId,
        eventType: input.action,
        sourceStatus,
        targetStatus,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        operatorId: actor.operatorId || null,
        operatorName: actor.operatorName.trim(),
        occurredAt,
      },
    })
    const equipment = await tx.equipment.findUniqueOrThrow({ where: { id: equipmentId }, include: equipmentInclude })
    return { existing, event, equipment }
  })
}
