import { Prisma } from '@prisma/client'
import { simpleProductSku } from './material-product'
import { calculateProductionConsumption, ProductionLossMode } from './production-consumption'
import { assertInventoryIssueAvailability } from './inventory'

const roundQty = (value: number) => Number(value.toFixed(6))

export async function buildDailyProductionConsumption(
  tx: Prisma.TransactionClient,
  finishedMaterialId: string,
  totalProcessedQty: number,
  requestedConsumptions: Array<{
    materialId: string
    locationId: string
    lossMode: ProductionLossMode
    lossValue: number
    actualQty?: number
  }>,
  options: {
    bomId: string
  },
) {
  const finishedMaterial = await tx.material.findFirst({
    where: { id: finishedMaterialId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      unit: true,
      stockUnit: true,
      valuationUnit: true,
      conversionRate: true,
    },
  })
  if (!finishedMaterial) throw new Error('产出物料不存在或已归档')

  const products = await tx.product.findMany({
    where: {
      sku: { in: [finishedMaterial.code, simpleProductSku(finishedMaterial.code)] },
    },
    include: {
      boms: {
        where: { isActive: true, id: options.bomId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        include: {
          items: {
            where: {
              itemType: 'MATERIAL',
              materialId: { not: null },
              OR: [{ outputMaterialId: finishedMaterial.id }, { outputMaterialId: null }],
            },
            orderBy: { id: 'asc' },
            include: {
              material: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  deletedAt: true,
                  stockUnit: true,
                  valuationUnit: true,
                  unit: true,
                },
              },
            },
          },
        },
      },
    },
  })
  const product = products.find((item) => item.sku === finishedMaterial.code)
    || products.find((item) => item.sku === simpleProductSku(finishedMaterial.code))
  const bom = product?.boms[0]
  if (!bom || bom.items.length === 0) {
    throw new Error('所选 BOM 方案不存在、已停用、不属于当前产出物料或没有投入明细')
  }

  const requestedLocationIds = Array.from(new Set(requestedConsumptions.flatMap((item) => {
    return [item.locationId]
  })))
  const activeLocations = requestedLocationIds.length > 0
    ? await tx.inventoryLocation.findMany({
        where: { id: { in: requestedLocationIds }, isActive: true, deletedAt: null },
        select: { id: true },
      })
    : []
  if (activeLocations.length !== requestedLocationIds.length) {
    throw new Error('投入明细中存在无效、停用或已归档的来源库位')
  }

  const consumptionByMaterial = new Map<string, {
    materialId: string
    locationId: string
    bomItemId: string
    materialCode: string
    materialName: string
    quantityPerUnit: number
    wastageRate: number
    lossMode: string
    lossValue: number
    lossQty: number
    plannedQty: number
    actualQty: number
    unit: string
    valuationUnit: string
  }>()

  const associatedMaterialIds = new Set(bom.items.flatMap((item) => item.material?.id ? [item.material.id] : []))
  const invalidInput = requestedConsumptions.find((item) => !associatedMaterialIds.has(item.materialId))
  if (invalidInput) throw new Error('实际耗用中存在未关联到当前 BOM 的原料')
  const requestedByMaterial = new Map(requestedConsumptions.map((item) => [item.materialId, item]))

  for (const item of bom.items) {
    if (!item.material || item.material.deletedAt) {
      throw new Error('BOM 中存在已归档或无效物料，请先修正 BOM')
    }
    if (item.material.id === finishedMaterial.id) {
      throw new Error('BOM 不能消耗产出物料自身')
    }
    const stockUnit = item.material.stockUnit || item.material.unit
    if (item.unit !== stockUnit) {
      throw new Error(`BOM 原料 ${item.material.code} ${item.material.name} 的单位必须为库存单位 ${stockUnit}`)
    }

    const outputBasis = Number(bom.outputQuantity || 1)
    const quantityPerUnit = roundQty(Number(item.quantity) / outputBasis)
    if (quantityPerUnit <= 0) {
      throw new Error(`请先填写原料 ${item.material.code} ${item.material.name} 的 BOM 每批投入数量`)
    }
    const requested = requestedByMaterial.get(item.material.id)
    if (!requested) throw new Error(`请填写原料 ${item.material.code} ${item.material.name} 的损耗方式`)
    const locationId = requested.locationId
    const calculated = calculateProductionConsumption({
      outputQty: totalProcessedQty,
      unitConsumption: quantityPerUnit,
      lossMode: requested.lossMode,
      lossValue: requested.lossValue,
      actualQty: requested.actualQty,
    })

    consumptionByMaterial.set(item.material.id, {
      materialId: item.material.id,
      locationId,
      bomItemId: item.id,
      materialCode: item.material.code,
      materialName: item.material.name,
      quantityPerUnit,
      wastageRate: requested.lossMode === 'PERCENT' ? requested.lossValue : 0,
      lossMode: requested.lossMode,
      lossValue: requested.lossValue,
      lossQty: calculated.lossQty,
      plannedQty: calculated.plannedQty,
      actualQty: calculated.actualQty,
      unit: item.material.stockUnit || item.material.unit,
      valuationUnit: item.material.valuationUnit || item.material.unit,
    })
  }

  if (consumptionByMaterial.size === 0) {
    throw new Error('BOM 没有可计算的每批投入数量，请先完善 BOM')
  }

  await Promise.all(Array.from(consumptionByMaterial.values()).map((line) => (
    assertInventoryIssueAvailability(tx, {
      materialId: line.materialId,
      stockQty: line.actualQty,
      locationId: line.locationId,
    })
  )))

  return {
    finishedMaterial,
    bom: {
      id: bom.id,
      name: bom.name,
      version: bom.version,
      outputQuantity: Number(bom.outputQuantity),
      outputUnit: bom.outputUnit,
    },
    consumptions: Array.from(consumptionByMaterial.values()),
  }
}
