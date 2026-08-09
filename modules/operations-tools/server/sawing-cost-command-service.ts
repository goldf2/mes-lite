import { getCurrentOperator } from '@/lib/auth'
import { resolveProductId } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import type { ParsedSawingScenarioInput } from '../contracts/sawing-cost'
import { sawingCostScenarioInclude } from './sawing-cost-select'

export class SawingCostServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SawingCostServiceError'
  }
}

const sawingCostObjectCode = (scenarioId: string) => `SAW-${scenarioId.slice(-8).toUpperCase()}`

export async function createSawingCostScenario(input: ParsedSawingScenarioInput, createdBy?: string | null) {
  if (input.productKind === 'EXISTING' && !input.productId) {
    throw new SawingCostServiceError('绑定已有物料时必须选择物料')
  }
  const operator = createdBy === undefined ? await getCurrentOperator() : null
  const operatorName = createdBy === undefined ? operator?.name || operator?.username || null : createdBy
  const { processTemplateIds, costItems, bomProductId, ...values } = input

  return prisma.$transaction(async (tx) => {
    const resolvedProductId = values.productKind === 'EXISTING' && values.productId
      ? await resolveProductId(tx, values.productId, { description: '由物料自动映射，用于锯切成本方案。' })
      : null
    const resolvedBomProductId = bomProductId
      ? await resolveProductId(tx, bomProductId, { description: '由物料自动映射，用于锯切成本/BOM 组成。' })
      : null
    const linkedProduct = resolvedProductId
      ? await tx.product.findUnique({ where: { id: resolvedProductId }, select: { sku: true, name: true } })
      : null
    const scenarioName = values.name?.trim()
      || (linkedProduct
        ? `${linkedProduct.sku} ${linkedProduct.name} 锯切成本`
        : `临时锯切 ${values.workpieceLength}mm ${values.bladeThickness}mm缝 ${values.materialCostPerPiece.toFixed(2)}元/件`)
    const created = await tx.sawingCostScenario.create({
      data: {
        ...values,
        name: scenarioName,
        productId: resolvedProductId,
        createdBy: operatorName,
        processTemplates: { connect: processTemplateIds.map((id) => ({ id })) },
        costItems: { create: costItems },
      },
    })
    const costObject = await tx.costObject.create({
      data: {
        code: sawingCostObjectCode(created.id),
        name: scenarioName,
        objectType: 'SAWING_COST',
        sourceType: 'SAWING_COST_SCENARIO',
        sourceId: created.id,
        unit: '件',
        costs: {
          create: {
            version: 'v1',
            materialCostPerUnit: values.materialCostPerPiece,
            laborHoursPerUnit: values.laborHoursPerPiece,
            machineHoursPerUnit: values.machineHoursPerPiece,
            directCostPerUnit: values.additionalDirectCost || 0,
          },
        },
      },
    })

    if (resolvedBomProductId) {
      const bom = await tx.bOM.findFirst({
        where: { productId: resolvedBomProductId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }) || await tx.bOM.create({
        data: { productId: resolvedBomProductId, name: '默认方案', version: 'v1', isDefault: true },
      })
      await tx.bOMItem.create({
        data: {
          bomId: bom.id, itemType: 'SAWING_COST', costObjectId: costObject.id,
          sawingScenarioId: created.id, quantity: 1, unit: '件', wastageRate: 0,
        },
      })
    }

    return tx.sawingCostScenario.findUniqueOrThrow({ where: { id: created.id }, include: sawingCostScenarioInclude })
  })
}
