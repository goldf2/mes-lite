import { prisma } from '@/lib/prisma'

export async function getQualityInspectionStandardWorkspace(input: { keyword?: string; status?: string }) {
  const keyword = input.keyword?.trim() || ''
  const status = input.status === 'DRAFT' || input.status === 'RELEASED' || input.status === 'OBSOLETE' ? input.status : undefined
  const [standards, materials] = await Promise.all([
    prisma.qualityInspectionStandard.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(keyword ? { OR: [
          { code: { contains: keyword } }, { name: { contains: keyword } },
          { material: { code: { contains: keyword } } }, { material: { name: { contains: keyword } } },
        ] } : {}),
      },
      include: {
        material: { select: { id: true, code: true, name: true, stockUnit: true, deletedAt: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }, { version: 'desc' }], take: 200,
    }),
    prisma.material.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, stockUnit: true }, orderBy: { code: 'asc' }, take: 500 }),
  ])
  return { standards, materials }
}
