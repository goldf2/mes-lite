import { materialAsProductOption, resolveProductId, simpleProductSku } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { bomCostRunInclude } from './bom-cost-select'

export async function listBomCostWorkspace(inputProductId?: string) {
  const productId = inputProductId ? await resolveProductId(prisma, inputProductId) : undefined
  const [products, materials, runs] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true, sku: true, name: true, unit: true,
        boms: {
          where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }], take: 1,
          select: {
            id: true, version: true, isActive: true, outputQuantity: true,
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
  const productBySku = new Map(products.flatMap((product) => [
    [product.sku, product],
    [product.sku.startsWith('MAT-') ? product.sku.slice(4) : product.sku, product],
  ]))
  const materialProducts = materials.map((material) => {
    const product = productBySku.get(material.code) || productBySku.get(simpleProductSku(material.code))
    if (!product) return { ...materialAsProductOption(material), bom: null }
    const bom = product.boms[0]
    return {
      ...materialAsProductOption(material),
      bom: bom ? { ...bom, items: bom.items.filter((item) => !item.outputMaterialId || item.outputMaterialId === material.id) } : null,
    }
  })
  return { products: materialProducts, runs }
}
