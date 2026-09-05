import { normalizeBomEntryQuantity } from '@/lib/bom-entry-units'
import { materialProductPrefix, resolveProductId, resolveMaterialIdForProduct } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { getUnitCatalog } from '@/lib/unit-catalog'
import type { SaveBomInput } from '../contracts/bom-schema'
import { BomDomainError } from '../domain/bom-errors'
import { validateBomStructure } from '../domain/bom-structure'
import { nextBomVersion } from '../domain/bom-version'
import { bomSelect } from './bom-select'

export async function saveBom(input: SaveBomInput) {
  const unitCatalog = await getUnitCatalog()
  const submittedOutputs = input.outputs || []
  const inputMaterialIds = input.items.map((item) => item.materialId)
  const submittedStructureError = validateBomStructure({
    purpose: input.purpose,
    outputs: submittedOutputs,
    inputMaterialIds,
    allowEmptyOutputs: true,
  })
  if (submittedStructureError) throw new BomDomainError(submittedStructureError)
  const requestedPrimaryMaterialId = submittedOutputs.find((output) => output.isPrimary)?.materialId
  const resolvedProductId = await prisma.$transaction((tx) => resolveProductId(
    tx,
    requestedPrimaryMaterialId ? `${materialProductPrefix}${requestedPrimaryMaterialId}` : input.productId,
    { description: '由 BOM 主产出物料自动映射。' },
  ))
  const product = await prisma.product.findUnique({ where: { id: resolvedProductId } })
  if (!product) throw new BomDomainError('物料不存在', 404)

  const outputMaterialId = submittedOutputs.length === 0 ? await resolveMaterialIdForProduct(prisma, product.id) : null
  const legacyOutputMaterial = outputMaterialId
    ? await prisma.material.findUnique({
        where: { id: outputMaterialId },
        select: { id: true, stockUnit: true, unit: true },
      })
    : null
  const normalizedOutputs = submittedOutputs.length > 0
    ? submittedOutputs
    : legacyOutputMaterial
      ? [{ materialId: legacyOutputMaterial.id, quantity: input.outputQuantity, isPrimary: true }]
      : []
  const normalizedStructureError = validateBomStructure({
    purpose: input.purpose,
    outputs: normalizedOutputs,
    inputMaterialIds,
  })
  if (normalizedStructureError) throw new BomDomainError(normalizedStructureError)

  const outputMaterialIds = normalizedOutputs.map((output) => output.materialId)
  const outputMaterials = await prisma.material.findMany({
    where: { id: { in: outputMaterialIds }, deletedAt: null },
    select: {
      id: true, code: true, name: true, primaryMeasure: true, referenceMeasure: true,
      stockUnit: true, unit: true, valuationUnit: true, conversionRate: true, unitVersion: true,
    },
  })
  if (outputMaterials.length !== outputMaterialIds.length) throw new BomDomainError('BOM 中存在无效或已归档的产出物料')
  const outputMaterialById = new Map(outputMaterials.map((material) => [material.id, material]))
  const submittedPrimaryOutput = normalizedOutputs.find((output) => output.isPrimary)!
  const primaryOutputMaterial = outputMaterialById.get(submittedPrimaryOutput.materialId)!

  const materialIds = Array.from(new Set(inputMaterialIds))
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
    select: {
      id: true, primaryMeasure: true, referenceMeasure: true, stockUnit: true, unit: true,
      valuationUnit: true, conversionRate: true, unitVersion: true,
    },
  })
  if (materials.length !== materialIds.length) throw new BomDomainError('BOM 中存在无效或已归档物料')
  const materialById = new Map(materials.map((material) => [material.id, material]))
  const items = input.items.map((item) => {
    const normalized = normalizeBomEntryQuantity({
      quantity: item.quantity,
      entryUnit: item.entryUnit || item.unit,
      material: materialById.get(item.materialId)!,
      catalog: unitCatalog,
    })
    return {
      itemType: 'MATERIAL', materialId: item.materialId, outputMaterialId: null,
      quantity: normalized.quantity, unit: normalized.unit, entryUnit: normalized.entryUnit,
      entryQuantity: normalized.entryQuantity, conversionRateUsed: normalized.conversionRateUsed,
      conversionSource: normalized.conversionSource, unitVersionUsed: normalized.unitVersionUsed, wastageRate: 0,
    }
  })
  const outputs = normalizedOutputs.map((output) => {
    const normalized = normalizeBomEntryQuantity({
      quantity: output.quantity,
      entryUnit: output.entryUnit,
      material: outputMaterialById.get(output.materialId)!,
      catalog: unitCatalog,
    })
    return {
      materialId: output.materialId, quantity: normalized.quantity,
      unit: normalized.unit, entryUnit: normalized.entryUnit, entryQuantity: normalized.entryQuantity,
      conversionRateUsed: normalized.conversionRateUsed, conversionSource: normalized.conversionSource,
      unitVersionUsed: normalized.unitVersionUsed, isPrimary: Boolean(output.isPrimary),
    }
  })
  const primaryOutput = outputs.find((output) => output.isPrimary)!

  const saved = await prisma.$transaction(async (tx) => {
    const existingBoms = await tx.bOM.findMany({
      where: { productId: product.id },
      select: { id: true, version: true, status: true },
      orderBy: { createdAt: 'desc' },
    })
    let target = input.bomId ? existingBoms.find((bom) => bom.id === input.bomId) : undefined
    if (input.bomId && !target) throw new BomDomainError('BOM 方案不存在', 404)
    if (!target && !input.createNew) {
      target = existingBoms.find((bom) => bom.status === 'DRAFT')
    }
    if (target && target.status !== 'DRAFT') {
      throw new BomDomainError('已发布或已作废 BOM 不可修改，请先创建新版本', 409)
    }

    const version = input.version || target?.version || nextBomVersion(existingBoms.map((bom) => bom.version))
    if ((!target || version !== target.version) && existingBoms.some((bom) => bom.version === version)) {
      throw new BomDomainError('同一产品的 BOM 版本号不能重复', 409)
    }

    const bom = target
      ? await tx.bOM.update({
          where: { id: target.id },
          data: {
            name: input.name || '默认方案', purpose: input.purpose, version,
            materialId: primaryOutputMaterial.id,
            status: 'DRAFT', isDefault: false, isActive: false,
            outputQuantity: primaryOutput.quantity,
            outputUnit: primaryOutputMaterial.stockUnit || primaryOutputMaterial.unit,
          },
          select: { id: true },
        })
      : await tx.bOM.create({
          data: {
            productId: product.id, materialId: primaryOutputMaterial.id,
            name: input.name || `方案 ${version}`, purpose: input.purpose, version,
            status: 'DRAFT', isDefault: false, isActive: false,
            outputQuantity: primaryOutput.quantity,
            outputUnit: primaryOutputMaterial.stockUnit || primaryOutputMaterial.unit,
          },
          select: { id: true },
        })

    const replacedItemIds = (await tx.bOMItem.findMany({
      where: { bomId: bom.id, itemType: 'MATERIAL' }, select: { id: true },
    })).map((item) => item.id)
    if (replacedItemIds.length > 0) {
      await tx.dailyProductionConsumption.updateMany({ where: { bomItemId: { in: replacedItemIds } }, data: { bomItemId: null } })
      await tx.bOMItem.deleteMany({ where: { id: { in: replacedItemIds } } })
    }
    if (items.length > 0) await tx.bOMItem.createMany({ data: items.map((item) => ({ ...item, bomId: bom.id })) })
    await tx.bOMOutput.deleteMany({ where: { bomId: bom.id } })
    await tx.bOMOutput.createMany({ data: outputs.map((output) => ({ ...output, bomId: bom.id })) })

    return tx.bOM.findUnique({ where: { id: bom.id }, select: bomSelect })
  })
  return { saved, product }
}
