import { canonicalizeProductCodes, getProductsByMaterialId, materialAsProductOption } from '@/lib/material-product'
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
        id: true, materialId: true, sku: true, name: true, unit: true,
        boms: {
          where: { status: 'RELEASED' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }], take: 1,
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
      include: { product: { select: { id: true, materialId: true, sku: true, name: true, unit: true } } },
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
  ])

  const productByMaterialId = await getProductsByMaterialId(prisma, products)
  const materialProducts = materials.map((material) => {
    const product = productByMaterialId.get(material.id)
    return {
      ...materialAsProductOption(material),
      bom: product?.boms[0] || null,
      processRoutes: product?.processRoutes || [],
      bomCostRuns: product?.bomCostRuns || [],
    }
  })

  const displayProducts = [
    ...recentRuns.map((run) => run.product),
    ...costObjects.flatMap((costObject) => costObject.bomItems.map((item) => item.bom.product)),
  ]
  const canonicalProducts = await canonicalizeProductCodes(prisma, displayProducts)
  displayProducts.forEach((product, index) => { product.sku = canonicalProducts[index].sku })
  return { costObjects, processTemplates, products: materialProducts, recentRuns }
}
