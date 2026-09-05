export const processRouteSelect = {
  id: true,
  name: true,
  isDefault: true,
  steps: {
    where: { deletedAt: null },
    orderBy: { stepNo: 'asc' as const },
    select: { id: true, stepNo: true, name: true, workstation: true, description: true },
  },
}

export const panoramaProductSelect = {
  id: true,
  materialId: true,
  sku: true,
  name: true,
  category: true,
  unit: true,
  customer: { select: { id: true, code: true, name: true } },
  processRoutes: { where: { isDefault: true }, select: processRouteSelect },
}
