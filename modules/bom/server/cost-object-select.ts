export const costObjectInclude = {
  costs: {
    where: { active: true },
    orderBy: { effectiveFrom: 'desc' as const },
    take: 1,
  },
  bomItems: {
    select: {
      id: true,
      quantity: true,
      unit: true,
      bom: {
        select: {
          id: true,
          version: true,
          product: { select: { id: true, materialId: true, sku: true, name: true, unit: true } },
        },
      },
    },
  },
} as const
