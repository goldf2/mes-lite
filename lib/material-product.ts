import { prisma } from './prisma'

export const materialProductPrefix = 'material:'

export function simpleProductSku(materialCode: string) {
  return `MAT-${materialCode}`
}

export function isMaterialProductId(value?: string | null) {
  return Boolean(value?.startsWith(materialProductPrefix))
}

type ProductResolver = Pick<typeof prisma, 'material' | 'product' | 'processRoute' | 'processStep'>

export function materialAsProductOption(material: {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  customerId?: string | null
  customer?: { id: string; code?: string; name: string } | null
  stockUnit: string
  unit: string
  createdAt?: Date | string
  stock?: {
    qty: number
    availableQty: number
    locationBalances: Array<{
      locationId: string
      qty: number
      availableQty: number
      location: { code: string; name: string; isActive: boolean; deletedAt: Date | null }
    }>
  } | null
}) {
  return {
    id: `${materialProductPrefix}${material.id}`,
    sku: material.code,
    name: material.name,
    category: material.category,
    customerId: material.customerId || null,
    customer: material.customer || null,
    unit: material.stockUnit || material.unit,
    description: material.spec || null,
    sourceMaterialId: material.id,
    stockQty: Number(material.stock?.qty || 0),
    availableQty: Number(material.stock?.availableQty || 0),
    locationBalances: (material.stock?.locationBalances || [])
      .filter((item) => item.location.isActive && !item.location.deletedAt)
      .map((item) => ({
        locationId: item.locationId,
        locationCode: item.location.code,
        locationName: item.location.name,
        qty: Number(item.qty),
        availableQty: Number(item.availableQty),
      })),
    createdAt: material.createdAt,
  }
}

export async function ensureProductForMaterial(
  tx: ProductResolver,
  material: {
    id: string
    code: string
    name: string
    category: string
    customerId?: string | null
    stockUnit: string
    unit: string
  },
  options: { defaultRoute?: boolean; description?: string } = {}
) {
  const sku = simpleProductSku(material.code)
  const routeSortOrder = options.defaultRoute
    ? ((await tx.processRoute.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
    : 0
  const existingProducts = await tx.product.findMany({
    where: { OR: [{ sku: material.code }, { sku }] },
    include: { processRoutes: options.defaultRoute ? { where: { isDefault: true }, include: { steps: true } } : false },
    take: 2,
  })
  if (existingProducts.length > 1) {
    throw new Error(`物料 ${material.code} 对应多个兼容 Product，请先执行人工映射`)
  }
  const existing = existingProducts[0]

  if (existing) {
    if (existing.materialId && existing.materialId !== material.id) {
      throw new Error(`兼容产品 ${existing.sku} 已绑定其他物料，禁止按编码改写映射`)
    }
    if (!existing.materialId) {
      const candidateCodes = existing.sku.startsWith('MAT-')
        ? [existing.sku, existing.sku.slice(4)]
        : [existing.sku]
      const candidateMaterials = await tx.material.findMany({
        where: { code: { in: candidateCodes }, deletedAt: null },
        select: { id: true },
        take: 2,
      })
      if (candidateMaterials.length > 1) {
        throw new Error(`兼容产品 ${existing.sku} 对应多个 Material 候选，请先执行人工映射`)
      }
    }
    if (options.defaultRoute) {
      const routes = ('processRoutes' in existing ? existing.processRoutes : []) as unknown as Array<{ id: string; steps: unknown[] }>
      const defaultRoute = routes[0]
      if (!defaultRoute) {
        await tx.processRoute.create({
          data: {
            productId: existing.id,
            materialId: material.id,
            name: '简易生产路线',
            isDefault: true,
            sortOrder: routeSortOrder,
            steps: { create: [{ stepNo: 1, name: '简易作业', workstation: '现场' }] },
          },
        })
      } else {
        const existingRoute = await tx.processRoute.findUnique({ where: { id: defaultRoute.id } })
        if (existingRoute?.materialId && existingRoute.materialId !== material.id) {
          throw new Error(`兼容产品 ${existing.sku} 的默认工艺路线已指向其他 Material`)
        }
        if (existingRoute && !existingRoute.materialId) {
          await tx.processRoute.update({ where: { id: existingRoute.id }, data: { materialId: material.id } })
        }
      }
      if (defaultRoute && defaultRoute.steps.length === 0) {
        await tx.processStep.create({
          data: {
            routeId: defaultRoute.id,
            stepNo: 1,
            name: '简易作业',
            workstation: '现场',
          },
        })
      }
    }
    return existing.id
  }

  const created = await tx.product.create({
    data: {
      sku,
      materialId: material.id,
      name: material.name,
      category: material.category,
      customerId: material.customerId || null,
      unit: material.stockUnit || material.unit,
      description: options.description || `由物料 ${material.code} 自动映射，用于兼容旧业务表。`,
      ...(options.defaultRoute
      ? {
          processRoutes: {
            create: {
              materialId: material.id,
              name: '简易生产路线',
                isDefault: true,
                sortOrder: routeSortOrder,
                steps: { create: [{ stepNo: 1, name: '简易作业', workstation: '现场' }] },
              },
            },
          }
        : {}),
    },
  })

  return created.id
}

export async function resolveProductId(
  tx: ProductResolver,
  targetId: string,
  options: { defaultRoute?: boolean; description?: string } = {}
) {
  if (!isMaterialProductId(targetId)) return targetId

  const materialId = targetId.slice(materialProductPrefix.length)
  const material = await tx.material.findUnique({
    where: { id: materialId },
    select: { id: true, code: true, name: true, category: true, customerId: true, stockUnit: true, unit: true, deletedAt: true },
  })
  if (!material || material.deletedAt) throw new Error('物料不存在或已归档，无法创建业务记录')

  return ensureProductForMaterial(tx, material, options)
}

export async function resolveMaterialIdForProduct(
  tx: Pick<ProductResolver, 'material' | 'product'>,
  productId: string,
  preferredMaterialId?: string | null,
) {
  if (preferredMaterialId) {
    const material = await tx.material.findUnique({
      where: { id: preferredMaterialId },
      select: { id: true, deletedAt: true },
    })
    if (material && !material.deletedAt) return material.id
  }

  if (isMaterialProductId(productId)) {
    const materialId = productId.slice(materialProductPrefix.length)
    const material = await tx.material.findUnique({
      where: { id: materialId },
      select: { id: true, deletedAt: true },
    })
    return material && !material.deletedAt ? material.id : null
  }

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { sku: true, materialId: true },
  })
  if (!product) return null
  if (product.materialId) {
    const explicitMaterial = await tx.material.findUnique({
      where: { id: product.materialId },
      select: { id: true, deletedAt: true },
    })
    return explicitMaterial && !explicitMaterial.deletedAt ? explicitMaterial.id : null
  }

  const materialCodes = product.sku.startsWith('MAT-')
    ? [product.sku, product.sku.slice(4)]
    : [product.sku]
  const materials = await tx.material.findMany({
    where: {
      code: { in: materialCodes },
      deletedAt: null,
    },
    orderBy: { code: 'asc' },
    select: { id: true },
    take: 2,
  })
  return materials.length === 1 ? materials[0].id : null
}
