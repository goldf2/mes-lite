import type { Prisma, PrismaClient } from '@prisma/client'
import {
  getUnitCatalog,
  normalizeUnitCode,
  type UnitCatalogEntry,
} from '@/lib/unit-catalog'
import { prisma } from '@/lib/prisma'

type UnitQueryClient = PrismaClient | Prisma.TransactionClient

interface MaterialUnitReference {
  primaryMeasure: string
  referenceMeasure: string | null
  stockUnit: string
  valuationUnit: string
}

interface BomUnitReference {
  entryUnit: string | null
  material: { primaryMeasure: string } | null
}

interface UnitUsageSnapshot {
  materials: MaterialUnitReference[]
  bomRows: BomUnitReference[]
}

async function loadUnitUsageSnapshot(client: UnitQueryClient): Promise<UnitUsageSnapshot> {
  const [materials, bomItems, bomOutputs] = await Promise.all([
    client.material.findMany({
      select: {
        primaryMeasure: true,
        referenceMeasure: true,
        stockUnit: true,
        valuationUnit: true,
      },
    }),
    client.bOMItem.findMany({
      where: { entryUnit: { not: null }, materialId: { not: null } },
      select: { entryUnit: true, material: { select: { primaryMeasure: true } } },
    }),
    client.bOMOutput.findMany({
      where: { entryUnit: { not: null } },
      select: { entryUnit: true, material: { select: { primaryMeasure: true } } },
    }),
  ])
  return { materials, bomRows: [...bomItems, ...bomOutputs] }
}

function unitUsage(unit: Pick<UnitCatalogEntry, 'measureType' | 'code'>, snapshot: UnitUsageSnapshot) {
  const code = normalizeUnitCode(unit.code)
  const usedByMaterialCount = snapshot.materials.filter((material) => (
    (material.primaryMeasure === unit.measureType && normalizeUnitCode(material.stockUnit) === code)
    || (material.referenceMeasure === unit.measureType && normalizeUnitCode(material.valuationUnit) === code)
  )).length
  const usedByBomCount = snapshot.bomRows.filter((row) => (
    row.material?.primaryMeasure === unit.measureType
    && normalizeUnitCode(row.entryUnit) === code
  )).length
  return {
    usedByMaterialCount,
    usedByBomCount,
    usageCount: usedByMaterialCount + usedByBomCount,
  }
}

export async function countConfiguredUnitUsage(
  unit: Pick<UnitCatalogEntry, 'measureType' | 'code'>,
  client: UnitQueryClient = prisma,
) {
  return unitUsage(unit, await loadUnitUsageSnapshot(client)).usageCount
}

export async function listConfiguredUnits(client: UnitQueryClient = prisma) {
  const [catalog, snapshot] = await Promise.all([
    getUnitCatalog(client),
    loadUnitUsageSnapshot(client),
  ])
  return catalog.map((unit) => ({ ...unit, ...unitUsage(unit, snapshot) }))
}
