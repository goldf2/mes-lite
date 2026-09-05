import { withMaterialImageUrls } from '@/lib/attachment-urls'
import { getProductsByMaterialId, materialAsProductOption } from '@/lib/material-product'
import { prisma } from '@/lib/prisma'
import { bomSelect, type ListedBom } from './bom-select'

function pickDefaultBom(boms: ListedBom[]) {
  return boms.find((bom) => bom.status === 'RELEASED' && bom.isDefault)
    || boms.find((bom) => bom.status === 'RELEASED')
    || boms.find((bom) => bom.status === 'DRAFT')
    || boms[0]
    || null
}

export async function listBoms() {
  const [products, materialOptions] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true, materialId: true, sku: true, name: true, category: true, unit: true,
        customer: { select: { id: true, name: true } },
        boms: { select: bomSelect, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true,
        unit: true, stockUnit: true, valuationUnit: true, primaryMeasure: true,
        referenceMeasure: true, conversionRate: true, unitVersion: true,
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      take: 1000,
    }),
  ])

  const productByMaterialId = await getProductsByMaterialId(prisma, products)
  const materialProducts = materialOptions.map((material) => {
    const product = productByMaterialId.get(material.id)
    if (!product) return { ...materialAsProductOption(material), bom: null, boms: [] }
    return { ...materialAsProductOption(material), bom: pickDefaultBom(product.boms), boms: product.boms }
  })

  const materialIds = materialOptions.map((material) => material.id)
  const [images, stocks] = materialIds.length === 0
    ? [[], []] as const
    : await Promise.all([
        prisma.documentAttachment.findMany({
          where: {
            ownerType: 'MATERIAL', ownerId: { in: materialIds }, documentType: 'MATERIAL_IMAGE',
            mimeType: { startsWith: 'image/' }, deletedAt: null,
          },
          orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, ownerId: true, note: true, mimeType: true, isCover: true, size: true, rotation: true },
        }),
        prisma.stock.findMany({ where: { materialId: { in: materialIds } }, select: { materialId: true, qty: true } }),
      ])
  const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
  for (const image of images) if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
  const stockQtyByMaterial = new Map(stocks.map((stock) => [stock.materialId, Number(stock.qty)]))
  return {
    products: materialProducts,
    materialOptions: materialOptions.map((material) => {
      const image = primaryImageByMaterial.get(material.id)
      return {
        ...material,
        stockQty: stockQtyByMaterial.get(material.id) || 0,
        primaryImage: image ? withMaterialImageUrls(image) : null,
      }
    }),
  }
}
