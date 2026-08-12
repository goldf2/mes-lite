import { prisma } from '@/lib/prisma'
import { validateBomStructure } from '../domain/bom-structure'
import { nextBomVersion } from '../domain/bom-version'
import { BomDomainError } from '../domain/bom-errors'
import { bomSelect } from './bom-select'

export async function releaseBomVersion(bomId: string, operatorId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.bOM.findUnique({
      where: { id: bomId },
      include: {
        outputs: { select: { materialId: true, isPrimary: true } },
        items: { where: { itemType: 'MATERIAL' }, select: { materialId: true } },
      },
    })
    if (!existing) throw new BomDomainError('BOM 版本不存在', 404)
    if (existing.status !== 'DRAFT') throw new BomDomainError('只有草稿 BOM 可以发布', 409)
    const structureError = validateBomStructure({
      purpose: existing.purpose as 'PRODUCTION' | 'PACKAGING',
      outputs: existing.outputs.map((output) => ({ materialId: output.materialId, quantity: 1, isPrimary: output.isPrimary })),
      inputMaterialIds: existing.items.flatMap((item) => item.materialId ? [item.materialId] : []),
    })
    if (structureError) throw new BomDomainError(structureError)

    await tx.bOM.updateMany({
      where: { productId: existing.productId, purpose: existing.purpose, isDefault: true },
      data: { isDefault: false },
    })
    return tx.bOM.update({
      where: { id: bomId },
      data: {
        status: 'RELEASED', isActive: true, isDefault: true,
        releasedAt: new Date(), releasedBy: operatorId || null,
        obsoleteAt: null, obsoleteBy: null,
      },
      select: bomSelect,
    })
  })
}

export async function copyBomVersion(bomId: string, changeReason?: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.bOM.findUnique({
      where: { id: bomId },
      include: { items: true, outputs: true },
    })
    if (!source) throw new BomDomainError('BOM 版本不存在', 404)
    const siblings = await tx.bOM.findMany({
      where: { productId: source.productId }, select: { version: true },
    })
    const version = nextBomVersion(siblings.map((bom) => bom.version))
    const copied = await tx.bOM.create({
      data: {
        productId: source.productId,
        name: `${source.name}（新版本）`,
        purpose: source.purpose,
        version,
        status: 'DRAFT',
        isDefault: false,
        isActive: false,
        outputQuantity: source.outputQuantity,
        outputUnit: source.outputUnit,
        basedOnBomId: source.id,
        changeReason: changeReason?.trim() || null,
      },
      select: { id: true },
    })
    if (source.items.length > 0) {
      await tx.bOMItem.createMany({ data: source.items.map((item) => ({
        bomId: copied.id,
        itemType: item.itemType,
        materialId: item.materialId,
        outputMaterialId: item.outputMaterialId,
        costObjectId: item.costObjectId,
        sawingScenarioId: item.sawingScenarioId,
        quantity: item.quantity,
        unit: item.unit,
        entryUnit: item.entryUnit,
        entryQuantity: item.entryQuantity,
        conversionRateUsed: item.conversionRateUsed,
        conversionSource: item.conversionSource,
        unitVersionUsed: item.unitVersionUsed,
        wastageRate: item.wastageRate,
      })) })
    }
    if (source.outputs.length > 0) {
      await tx.bOMOutput.createMany({ data: source.outputs.map((output) => ({
        bomId: copied.id,
        materialId: output.materialId,
        quantity: output.quantity,
        unit: output.unit,
        entryUnit: output.entryUnit,
        entryQuantity: output.entryQuantity,
        conversionRateUsed: output.conversionRateUsed,
        conversionSource: output.conversionSource,
        unitVersionUsed: output.unitVersionUsed,
        isPrimary: output.isPrimary,
      })) })
    }
    return tx.bOM.findUniqueOrThrow({ where: { id: copied.id }, select: bomSelect })
  })
}

export async function obsoleteBomVersion(bomId: string, operatorId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.bOM.findUnique({ where: { id: bomId } })
    if (!existing) throw new BomDomainError('BOM 版本不存在', 404)
    if (existing.status !== 'RELEASED') throw new BomDomainError('只有已发布 BOM 可以作废', 409)

    const saved = await tx.bOM.update({
      where: { id: bomId },
      data: {
        status: 'OBSOLETE', isActive: false, isDefault: false,
        obsoleteAt: new Date(), obsoleteBy: operatorId || null,
      },
      select: bomSelect,
    })
    if (existing.isDefault) {
      const replacement = await tx.bOM.findFirst({
        where: {
          productId: existing.productId, purpose: existing.purpose,
          status: 'RELEASED', id: { not: existing.id },
        },
        orderBy: [{ releasedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
      })
      if (replacement) await tx.bOM.update({ where: { id: replacement.id }, data: { isDefault: true } })
    }
    return saved
  })
}
