import { canonicalizeProductCodes, getProductsByMaterialId, materialAsProductOption, resolveProductId } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { bomCostRunInclude } from './bom-cost-select'

export async function listBomCostWorkspace(inputProductId?: string) {
  const productId = inputProductId ? await resolveProductId(prisma, inputProductId) : undefined
  const [products, materials, runs] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true, materialId: true, sku: true, name: true, unit: true,
        boms: {
          where: { status: 'RELEASED' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true, name: true, version: true, isActive: true, isDefault: true, outputQuantity: true, outputUnit: true,
            outputs: { where: { isPrimary: true }, take: 1, select: { materialId: true, quantity: true } },
            items: {
              where: { itemType: 'MATERIAL', materialId: { not: null } },
              select: {
                id: true, quantity: true, unit: true, outputMaterialId: true,
                material: { select: { id: true, code: true, name: true, stockUnit: true, unit: true } },
              },
            },
          },
        },
        processRoutes: {
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          select: {
            id: true, name: true, isDefault: true,
            steps: {
              where: { deletedAt: null }, orderBy: { stepNo: 'asc' },
              select: {
                id: true, stepNo: true, name: true, templateCode: true,
                standardBatchQty: true, setupTimeMinutes: true, cycleTimeSeconds: true,
                peopleCount: true, laborRatePerHour: true, machineCount: true,
                machineRatePerHour: true, energyCostPerHour: true,
                consumableCostPerBatch: true, yieldRate: true,
                workCenter: { select: { id: true, code: true, name: true, laborRatePerHour: true, machineRatePerHour: true, energyCostPerHour: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true, customerId: true,
        customer: { select: { id: true, code: true, name: true } }, unit: true, stockUnit: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.bomCostRun.findMany({
      where: productId ? { productId } : undefined, include: bomCostRunInclude,
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
  ])
  const productByMaterialId = await getProductsByMaterialId(prisma, products)
  const materialProducts = materials.map((material) => {
    const product = productByMaterialId.get(material.id)
    if (!product) return { ...materialAsProductOption(material), bom: null, boms: [], processRoutes: [] }
    const boms = product.boms.map((bom) => ({
      ...bom,
      items: bom.items.filter((item) => !item.outputMaterialId || item.outputMaterialId === material.id),
    }))
    const bom = boms[0]
    return {
      ...materialAsProductOption(material),
      bom: bom || null,
      boms,
      processRoutes: product.processRoutes,
    }
  })
  const runProducts = await canonicalizeProductCodes(prisma, runs.map((run) => run.product))
  return { products: materialProducts, runs: runs.map((run, index) => ({ ...run, product: runProducts[index] })) }
}
