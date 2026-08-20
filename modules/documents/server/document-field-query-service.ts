import { prisma } from '@/lib/prisma'

export const documentFieldInclude = {
  _count: { select: { values: true } },
} as const

export function listDocumentFieldDefinitions(categoryId: string) {
  return prisma.documentFieldDefinition.findMany({
    where: { categoryId },
    include: documentFieldInclude,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}
