import { Prisma } from '@prisma/client'

export const sawingCostScenarioInclude = {
  product: { select: { id: true, sku: true, name: true, unit: true } },
  bomItems: { include: { bom: { select: { id: true, product: { select: { id: true, sku: true, name: true } } } } } },
  processTemplates: { select: { id: true, code: true, name: true, category: true } },
  costItems: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] },
} satisfies Prisma.SawingCostScenarioInclude
