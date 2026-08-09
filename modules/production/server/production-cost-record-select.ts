export const productionCostRecordInclude = {
  order: {
    select: {
      id: true,
      orderNo: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  },
} as const
