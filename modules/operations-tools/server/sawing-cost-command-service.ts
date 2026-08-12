import { getCurrentOperator } from '@/lib/auth'
import { resolveMaterialIdForProduct, resolveProductId } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { nextBomVersion } from '@/modules/bom'
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
      ? await tx.product.findUnique({ where: { id: resolvedProductId }, select: { sku: true, name: true, materialId: true } })
      : null
    const linkedMaterialId = resolvedProductId
      ? await resolveMaterialIdForProduct(tx, values.productId!, linkedProduct?.materialId)
      : null
    if (resolvedProductId && !linkedMaterialId) throw new SawingCostServiceError('所选产品无法解析到有效 Material')
    const linkedBomProduct = resolvedBomProductId
      ? await tx.product.findUnique({ where: { id: resolvedBomProductId }, select: { materialId: true } })
      : null
    const linkedBomMaterialId = resolvedBomProductId
      ? await resolveMaterialIdForProduct(tx, bomProductId!, linkedBomProduct?.materialId)
      : null
    if (resolvedBomProductId && !linkedBomMaterialId) throw new SawingCostServiceError('BOM 所选产品无法解析到有效 Material')
    const scenarioName = values.name?.trim()
      || (linkedProduct
        ? `${linkedProduct.sku} ${linkedProduct.name} 锯切成本`
        : `临时锯切 ${values.workpieceLength}mm ${values.bladeThickness}mm缝 ${values.materialCostPerPiece.toFixed(2)}元/件`)
    const created = await tx.sawingCostScenario.create({
      data: {
        ...values,
        name: scenarioName,
        productId: resolvedProductId,
        materialId: linkedMaterialId,
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
      let bom = await tx.bOM.findFirst({
        where: { productId: resolvedBomProductId, status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
      })
      if (!bom) {
        const source = await tx.bOM.findFirst({
          where: { productId: resolvedBomProductId, status: 'RELEASED' },
          orderBy: [{ isDefault: 'desc' }, { releasedAt: 'desc' }, { createdAt: 'desc' }],
          include: { items: true, outputs: true },
        })
        const versions = await tx.bOM.findMany({
          where: { productId: resolvedBomProductId }, select: { version: true },
        })
        bom = await tx.bOM.create({
          data: {
            productId: resolvedBomProductId,
            materialId: linkedBomMaterialId!,
            name: source ? `${source.name}（新版本）` : '默认方案',
            purpose: source?.purpose || 'PRODUCTION',
            version: nextBomVersion(versions.map((item) => item.version)),
            status: 'DRAFT', isDefault: false, isActive: false,
            outputQuantity: source?.outputQuantity || 1,
            outputUnit: source?.outputUnit || '件',
            basedOnBomId: source?.id || null,
          },
        })
        if (source?.items.length) await tx.bOMItem.createMany({
          data: source.items.map(({ id: _id, ...item }) => ({ ...item, bomId: bom!.id })),
        })
        if (source?.outputs.length) await tx.bOMOutput.createMany({
          data: source.outputs.map(({ id: _id, createdAt: _createdAt, ...output }) => ({ ...output, bomId: bom!.id })),
        })
      }
      if (bom.materialId && bom.materialId !== linkedBomMaterialId) {
        throw new SawingCostServiceError('BOM 已绑定其他 Material，禁止加入锯切成本')
      }
      const bomOutputs = await tx.bOMOutput.findMany({ where: { bomId: bom.id } })
      const primaryOutputs = bomOutputs.filter((output) => output.isPrimary)
      if (primaryOutputs.length > 1 || (primaryOutputs[0] && primaryOutputs[0].materialId !== linkedBomMaterialId)) {
        throw new SawingCostServiceError('BOM 主产出与所选 Material 不一致')
      }
      if (primaryOutputs.length === 0) {
        const matchingOutput = bomOutputs.find((output) => output.materialId === linkedBomMaterialId)
        if (matchingOutput) {
          await tx.bOMOutput.update({ where: { id: matchingOutput.id }, data: { isPrimary: true } })
        } else {
          await tx.bOMOutput.create({
            data: {
              bomId: bom.id, materialId: linkedBomMaterialId!, quantity: bom.outputQuantity,
              unit: bom.outputUnit, isPrimary: true,
            },
          })
        }
      }
      if (!bom.materialId) {
        bom = await tx.bOM.update({ where: { id: bom.id }, data: { materialId: linkedBomMaterialId } })
      }
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
