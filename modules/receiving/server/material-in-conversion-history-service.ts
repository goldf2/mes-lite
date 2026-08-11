import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveMaterialUnits } from '@/lib/units'
import { MaterialInDomainError } from '../domain/material-in-errors'

export const materialInHistoryMinimumSamples = 3
const materialInHistoryMaximumSamples = 100

type ConversionHistoryClient = Pick<Prisma.TransactionClient, 'material' | 'materialIn'>

export interface MaterialInConversionHistory {
  materialId: string
  stockUnit: string
  valuationUnit: string
  unitVersion: number
  minimumSamples: number
  sampleCount: number
  rate: number | null
  available: boolean
}

export async function loadMaterialInConversionHistory(
  materialId: string,
  client: ConversionHistoryClient = prisma,
): Promise<MaterialInConversionHistory> {
  const material = await client.material.findFirst({ where: { id: materialId, deletedAt: null } })
  if (!material) throw new MaterialInDomainError('物料不存在或已归档', 404)
  const units = resolveMaterialUnits(material)
  const usesAuxiliaryUnit = Boolean(
    material.referenceMeasure
      && material.referenceMeasure !== material.primaryMeasure
      && units.valuationUnit !== units.stockUnit,
  )
  if (!usesAuxiliaryUnit) {
    return {
      materialId,
      stockUnit: units.stockUnit,
      valuationUnit: units.stockUnit,
      unitVersion: material.unitVersion,
      minimumSamples: materialInHistoryMinimumSamples,
      sampleCount: 0,
      rate: 1,
      available: true,
    }
  }

  const samples = await client.materialIn.findMany({
    where: {
      materialId,
      status: 'RECEIVED',
      deletedAt: null,
      conversionSource: 'DOCUMENT_ACTUAL',
      unit: units.stockUnit,
      valuationUnit: units.valuationUnit,
      unitVersionUsed: material.unitVersion,
      qty: { gt: 0 },
      valuationQty: { gt: 0 },
    },
    select: { qty: true, valuationQty: true },
    orderBy: { inboundDate: 'desc' },
    take: materialInHistoryMaximumSamples,
  })
  const totalStockQty = samples.reduce((sum, sample) => sum + Number(sample.qty), 0)
  const totalValuationQty = samples.reduce((sum, sample) => sum + Number(sample.valuationQty), 0)
  const rate = totalStockQty > 0 ? Number((totalValuationQty / totalStockQty).toFixed(6)) : null
  return {
    materialId,
    stockUnit: units.stockUnit,
    valuationUnit: units.valuationUnit,
    unitVersion: material.unitVersion,
    minimumSamples: materialInHistoryMinimumSamples,
    sampleCount: samples.length,
    rate,
    available: samples.length >= materialInHistoryMinimumSamples && Boolean(rate && rate > 0),
  }
}
