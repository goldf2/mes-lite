import type { Prisma } from '@prisma/client'

export const bomItemSelect = {
  id: true,
  itemType: true,
  quantity: true,
  unit: true,
  entryUnit: true,
  entryQuantity: true,
  conversionRateUsed: true,
  conversionSource: true,
  unitVersionUsed: true,
  wastageRate: true,
  outputMaterialId: true,
  outputMaterial: { select: {
    id: true, code: true, name: true, spec: true, category: true,
    unit: true, stockUnit: true, valuationUnit: true, primaryMeasure: true,
    referenceMeasure: true, conversionRate: true, unitVersion: true,
  } },
  material: { select: {
    id: true, code: true, name: true, spec: true, category: true,
    unit: true, stockUnit: true, valuationUnit: true, primaryMeasure: true,
    referenceMeasure: true, conversionRate: true, unitVersion: true,
  } },
  costObject: { select: { id: true, code: true, name: true, objectType: true, unit: true } },
  sawingScenario: { select: { id: true, name: true } },
} as const

export const bomSelect = {
  id: true,
  name: true,
  purpose: true,
  version: true,
  status: true,
  isDefault: true,
  isActive: true,
  basedOnBomId: true,
  changeReason: true,
  releasedAt: true,
  obsoleteAt: true,
  outputQuantity: true,
  outputUnit: true,
  createdAt: true,
  updatedAt: true,
  outputs: {
    orderBy: { isPrimary: 'desc' as const },
    select: {
      id: true, quantity: true, unit: true, entryUnit: true, entryQuantity: true,
      conversionRateUsed: true, conversionSource: true, unitVersionUsed: true, isPrimary: true,
      material: { select: {
        id: true, code: true, name: true, spec: true, category: true,
        unit: true, stockUnit: true, valuationUnit: true, primaryMeasure: true,
        referenceMeasure: true, conversionRate: true, unitVersion: true,
      } },
    },
  },
  items: { orderBy: { id: 'asc' as const }, select: bomItemSelect },
} as const

export type ListedBom = Prisma.BOMGetPayload<{ select: typeof bomSelect }>
