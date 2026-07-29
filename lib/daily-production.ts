import { Prisma } from '@prisma/client'
import { simpleProductSku } from './material-product'

const roundQty = (value: number) => Number(value.toFixed(6))

export async function buildDailyProductionConsumption(
  tx: Prisma.TransactionClient,
  finishedMaterialId: string,
  totalProcessedQty: number,
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
      bom: {
        include: {
          items: {
            where: { itemType: 'MATERIAL', materialId: { not: null } },
            include: {
              material: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  deletedAt: true,
                  stockUnit: true,
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
  const bom = product?.bom
  if (!bom || !bom.isActive || bom.items.length === 0) {
    throw new Error(`物料 ${finishedMaterial.code} ${finishedMaterial.name} 尚未建立有效 BOM，不能确认库存日报`)
  }

  const consumptionByMaterial = new Map<string, {
    materialId: string
    bomItemId: string
    materialCode: string
    materialName: string
    quantityPerUnit: number
    wastageRate: number
    plannedQty: number
    actualQty: number
    unit: string
  }>()

  for (const item of bom.items) {
    if (!item.material || item.material.deletedAt) {
      throw new Error('BOM 中存在已归档或无效物料，请先修正 BOM')
    }
    if (item.material.id === finishedMaterial.id) {
      throw new Error('BOM 不能消耗产出物料自身')
    }

    const quantityPerUnit = Number(item.quantity)
    const wastageRate = Number(item.wastageRate)
    const plannedQty = roundQty(totalProcessedQty * quantityPerUnit * (1 + wastageRate / 100))
    if (plannedQty <= 0) continue

    const existing = consumptionByMaterial.get(item.material.id)
    if (existing) {
      existing.quantityPerUnit = roundQty(existing.quantityPerUnit + quantityPerUnit)
      existing.plannedQty = roundQty(existing.plannedQty + plannedQty)
      existing.actualQty = existing.plannedQty
      continue
    }

    consumptionByMaterial.set(item.material.id, {
      materialId: item.material.id,
      bomItemId: item.id,
      materialCode: item.material.code,
      materialName: item.material.name,
      quantityPerUnit,
      wastageRate,
      plannedQty,
      actualQty: plannedQty,
      unit: item.unit || item.material.stockUnit || item.material.unit,
    })
  }

  if (consumptionByMaterial.size === 0) {
    throw new Error('BOM 没有可计算的原料用量，请先完善 BOM')
  }

  return {
    finishedMaterial,
    bom: { id: bom.id, version: bom.version },
    consumptions: Array.from(consumptionByMaterial.values()),
  }
}
