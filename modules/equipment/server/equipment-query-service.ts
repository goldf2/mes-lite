import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { equipmentStatusValues } from '../contracts/equipment-schema'

export const equipmentInclude = {
  workCenter: { select: { id: true, code: true, name: true, isActive: true } },
} satisfies Prisma.EquipmentInclude

export async function listManagedEquipment(input: {
  keyword?: string | null
  workCenterId?: string | null
  includeArchived?: boolean
}) {
  const keywordFilters = tokenizeKeywordQuery(input.keyword?.trim() || '').map((token) => ({ OR: [
    { code: { contains: token } }, { name: { contains: token } },
    { equipmentType: { contains: token } }, { model: { contains: token } },
    { manufacturer: { contains: token } }, { serialNumber: { contains: token } },
    { workCenter: { is: { name: { contains: token } } } },
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
