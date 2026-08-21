import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { equipmentStatusValues } from '../contracts/equipment-schema'
import { equipmentStatusOptions } from '../model/equipment-view'

export const equipmentInclude = {
  workCenter: { select: { id: true, code: true, name: true, isActive: true } },
  _count: { select: { events: true } },
} satisfies Prisma.EquipmentInclude

function dateRange(token: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(token)) return null
  const start = new Date(`${token}T00:00:00+08:00`)
  return Number.isNaN(start.getTime()) ? null : { gte: start, lt: new Date(start.getTime() + 86_400_000) }
}

export async function listManagedEquipment(input: {
  keyword?: string | null
  workCenterId?: string | null
  includeArchived?: boolean
}) {
  const keywordFilters = tokenizeKeywordQuery(input.keyword?.trim() || '').map((token) => ({ OR: [
    { code: { contains: token } }, { name: { contains: token } },
    { equipmentType: { contains: token } }, { model: { contains: token } },
    { manufacturer: { contains: token } }, { serialNumber: { contains: token } },
    { location: { contains: token } }, { basicParameters: { contains: token } }, { note: { contains: token } },
    { workCenter: { is: { code: { contains: token } } } }, { workCenter: { is: { name: { contains: token } } } },
    ...equipmentStatusOptions.filter((option) => option.label.includes(token)).map((option) => ({ status: option.value })),
    ...(dateRange(token) ? [{ createdAt: dateRange(token)! }] : []),
  ] }))
  const where: Prisma.EquipmentWhereInput = {
    ...(input.includeArchived ? {} : { deletedAt: null }),
    ...(input.workCenterId?.trim() ? { workCenterId: input.workCenterId.trim() } : {}),
    ...(keywordFilters.length > 0 ? { AND: keywordFilters } : {}),
  }
  return prisma.equipment.findMany({
    where,
    include: equipmentInclude,
    orderBy: [{ deletedAt: 'asc' }, { code: 'asc' }],
  })
}

export function getEquipmentStatuses() {
  return equipmentStatusValues
}
