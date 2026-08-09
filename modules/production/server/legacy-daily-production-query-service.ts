import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tokenizeKeywordQuery } from '@/lib/resource-search'
import { withMaterialImageUrls } from '@/lib/attachment-urls'

export const legacyDailyProductionReportInclude = {
  consumptionLocation: { select: { id: true, code: true, name: true } },
  outputLocation: { select: { id: true, code: true, name: true } },
  finishedMaterial: {
    select: {
      id: true, code: true, name: true, category: true,
      primaryMeasure: true, stockUnit: true, unit: true,
    },
  },
  employees: {
    include: {
      employee: { select: { id: true, code: true, name: true, department: true, isActive: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  consumptions: {
    include: {
      location: { select: { id: true, code: true, name: true } },
      material: {
        select: {
          id: true, code: true, name: true, primaryMeasure: true,
          stockUnit: true, unit: true, stock: { select: { qty: true, availableQty: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.DailyProductionReportInclude

export const legacyDailyProductionStatusInclude = {
  finishedMaterial: true,
  consumptions: { include: { material: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.DailyProductionReportInclude

export async function listLegacyDailyProductionWorkspace(input: {
  keyword?: string | null
  status?: string | null
}) {
  const keywordFilters = tokenizeKeywordQuery(input.keyword?.trim() || '').map((token) => ({ OR: [
    { reportNo: { contains: token } },
    { workers: { contains: token } },
    { note: { contains: token } },
    { finishedMaterial: { is: { code: { contains: token } } } },
    { finishedMaterial: { is: { name: { contains: token } } } },
  ] }))
  const where: Prisma.DailyProductionReportWhereInput = {
    ...(input.status?.trim() && input.status !== 'ALL' ? { status: input.status.trim() } : {}),
    ...(keywordFilters.length > 0 ? { AND: keywordFilters } : {}),
  }
  const [reports, materials, employees] = await Promise.all([
    prisma.dailyProductionReport.findMany({
      where,
      include: legacyDailyProductionReportInclude,
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, spec: true, category: true,
        primaryMeasure: true, stockUnit: true, unit: true,
        customer: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      take: 1000,
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, department: true },
      orderBy: [{ code: 'asc' }],
    }),
  ])

  const materialCodes = materials.flatMap((material) => [material.code, `MAT-${material.code}`])
  const materialIds = materials.map((material) => material.id)
  const [compatibleProducts, images] = await Promise.all([
    materialCodes.length > 0
      ? prisma.product.findMany({
          where: { sku: { in: materialCodes } },
          select: {
            sku: true,
            boms: {
              where: { isActive: true },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              select: {
                id: true, name: true, version: true, isDefault: true, isActive: true,
                outputQuantity: true, outputUnit: true,
                items: {
                  where: { itemType: 'MATERIAL', materialId: { not: null } },
                  select: {
                    id: true, outputMaterialId: true, quantity: true, unit: true, wastageRate: true,
                    material: {
                      select: {
                        id: true, code: true, name: true, spec: true,
                        primaryMeasure: true, stockUnit: true, unit: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [],
    materialIds.length > 0
      ? prisma.documentAttachment.findMany({
          where: {
            ownerType: 'MATERIAL', ownerId: { in: materialIds }, documentType: 'MATERIAL_IMAGE',
            mimeType: { startsWith: 'image/' }, deletedAt: null,
          },
          orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true, ownerId: true, note: true, mimeType: true,
            isCover: true, size: true, rotation: true,
          },
        })
      : [],
  ])

  const productBySku = new Map(compatibleProducts.map((product) => [product.sku, product]))
  const primaryImageByMaterial = new Map<string, (typeof images)[number]>()
  for (const image of images) {
    if (!primaryImageByMaterial.has(image.ownerId)) primaryImageByMaterial.set(image.ownerId, image)
  }
  const materialsWithBom = materials.map((material) => {
    const product = productBySku.get(material.code) || productBySku.get(`MAT-${material.code}`)
    const image = primaryImageByMaterial.get(material.id)
    const compatibleBoms = (product?.boms || []).map((bom) => ({
      ...bom,
      items: bom.items.filter((item) => !item.outputMaterialId || item.outputMaterialId === material.id),
    }))
    return {
      ...material,
      bom: compatibleBoms[0] || null,
      boms: compatibleBoms,
      primaryImage: image ? withMaterialImageUrls(image) : null,
    }
  })

  return { reports, materials: materialsWithBom, employees }
}
