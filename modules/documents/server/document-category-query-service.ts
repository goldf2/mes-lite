import { prisma } from '@/lib/prisma'

export const documentCategoryInclude = {
  parent: { select: { id: true, name: true } },
  _count: { select: { children: true, workInstructions: true } },
} as const

export function listManagedDocumentCategories() {
  return prisma.documentCategory.findMany({
    include: documentCategoryInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}
