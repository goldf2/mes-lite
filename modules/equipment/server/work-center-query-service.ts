import { prisma } from '@/lib/prisma'

export async function listManagedWorkCenters(includeInactive = false) {
  return prisma.workCenter.findMany({
    where: includeInactive ? {} : { isActive: true, deletedAt: null },
    include: { _count: { select: { equipment: true } } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
}
