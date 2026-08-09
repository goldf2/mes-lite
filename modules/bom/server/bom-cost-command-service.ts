import { resolveProductId } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import type { BomCostRunInput } from '../contracts/bom-cost'
import { BomCostRuleError, calculateBomCostSnapshot } from '../domain/bom-cost'
import { bomCostProductInclude, bomCostRunInclude } from './bom-cost-select'

export class BomCostServiceError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
    super(message)
    this.name = 'BomCostServiceError'
  }
}

export async function createBomCostRun(input: BomCostRunInput, createdBy: string | null) {
  const productId = await prisma.$transaction((tx) => resolveProductId(tx, input.productId, {
    description: '由物料自动映射，用于 BOM 成本计算。',
  }))
  const product = await prisma.product.findUnique({ where: { id: productId }, include: bomCostProductInclude })
  if (!product) throw new BomCostServiceError('物料不存在', 404)
  const bom = product.boms[0]
  if (!bom) throw new BomCostServiceError('该物料暂无有效的默认 BOM，无法计算成本', 400)
  const primaryOutput = bom.outputs[0]
  let snapshot
  try {
    snapshot = calculateBomCostSnapshot({
      ...input,
      items: bom.items,
      outputQuantity: primaryOutput?.quantity || bom.outputQuantity || 1,
      primaryOutputMaterialId: primaryOutput?.materialId,
      productUnit: product.unit,
    })
  } catch (error) {
    if (error instanceof BomCostRuleError) throw new BomCostServiceError(error.message, 400)
    throw error
  }
  return prisma.bomCostRun.create({
    data: {
      productId: product.id, bomId: bom.id, bomVersion: bom.version,
      quantityBasis: input.quantityBasis, laborRatePerHour: input.laborRatePerHour,
      machineRatePerHour: input.machineRatePerHour, overheadCost: input.overheadCost,
      totalMaterialCost: snapshot.totalMaterialCost, totalLaborCost: snapshot.totalLaborCost,
      totalMachineCost: snapshot.totalMachineCost, totalDirectCost: snapshot.totalDirectCost,
      totalCost: snapshot.totalCost, unitCost: snapshot.unitCost, createdBy,
      lines: { create: snapshot.lines },
    },
    include: bomCostRunInclude,
  })
}
