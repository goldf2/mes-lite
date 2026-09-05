export const bomCostRunInclude = {
  product: { select: { id: true, materialId: true, sku: true, name: true, unit: true } },
  lines: { orderBy: { sortOrder: 'asc' as const } },
}

export const bomCostProductInclude = {
  boms: {
    where: { status: 'RELEASED' },
    orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    include: {
      outputs: { where: { isPrimary: true }, take: 1 },
      items: {
        orderBy: { id: 'asc' as const },
        include: {
          material: { include: { stock: true } },
          sawingScenario: true,
          costObject: {
            include: {
              costs: { where: { active: true }, orderBy: { effectiveFrom: 'desc' as const }, take: 1 },
            },
          },
        },
      },
    },
  },
  processRoutes: {
    orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }],
    include: {
      steps: {
        where: { deletedAt: null },
        orderBy: { stepNo: 'asc' as const },
        include: { workCenter: { select: { id: true, code: true, name: true } } },
      },
    },
  },
}
