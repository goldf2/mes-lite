import { materialAsProductOption, simpleProductSku } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { costObjectInclude } from './cost-object-select'

export async function listCostObjectWorkspace() {
  const [costObjects, processTemplates, products, materials, recentRuns] = await Promise.all([
    prisma.costObject.findMany({ include: costObjectInclude, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.processTemplate.findMany({
      include: { materials: { select: { id: true, code: true, name: true } } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      take: 100,
    }),
    prisma.product.findMany({
      select: {
        id: true, sku: true, name: true, unit: true,
        boms: {
          where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }], take: 1,
          select: {
            id: true, version: true, isActive: true,
            items: {
              select: {
                id: true, itemType: true, quantity: true, unit: true, wastageRate: true,
                material: { select: { id: true, code: true, name: true, stockUnit: true, valuationUnit: true } },
                costObject: { select: { id: true, code: true, name: true, objectType: true, unit: true } },
                sawingScenario: { select: { id: true, name: true } },
              },
            },
          },
        },
        processRoutes: {
          where: { isDefault: true },
          select: {
            id: true, name: true, isDefault: true,
            steps: {
              where: { deletedAt: null }, orderBy: { stepNo: 'asc' },
              select: {
                id: true, stepNo: true, name: true, templateCode: true, standardBatchQty: true,
                setupTimeMinutes: true, cycleTimeSeconds: true, peopleCount: true,
                laborRatePerHour: true, machineCount: true, machineRatePerHour: true,
                energyCostPerHour: true, consumableCostPerBatch: true, yieldRate: true,
              },
            },
          },
        },
        bomCostRuns: {
          orderBy: { createdAt: 'desc' }, take: 1,
          select: { id: true, unitCost: true, totalCost: true, quantityBasis: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true, customerId: true,
        customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' }, take: 500,
    }),
    prisma.bomCostRun.findMany({
      include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
  ])

  const productBySku = new Map(products.flatMap((product) => [
    [product.sku, product],
    [product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku, product],
  ]))
  const materialProducts = materials.map((material) => {
    const product = productBySku.get(material.code) || productBySku.get(simpleProductSku(material.code))
    return {
      ...materialAsProductOption(material),
      bom: product?.boms[0] || null,
      processRoutes: product?.processRoutes || [],
      bomCostRuns: product?.bomCostRuns || [],
    }
  })

  return { costObjects, processTemplates, products: materialProducts, recentRuns }
}
