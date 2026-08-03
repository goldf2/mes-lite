import { prisma } from './prisma'

export const materialProductPrefix = 'material:'

export function simpleProductSku(materialCode: string) {
  return `MAT-${materialCode}`
}

export function isMaterialProductId(value?: string | null) {
  return Boolean(value?.startsWith(materialProductPrefix))
}

type ProductResolver = Pick<typeof prisma, 'material' | 'product' | 'stock' | 'processRoute' | 'processStep'>

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
  const existing = await tx.product.findFirst({
    where: { OR: [{ sku: material.code }, { sku }] },
    include: { stock: true, processRoutes: options.defaultRoute ? { where: { isDefault: true }, include: { steps: true } } : false },
  })

  if (existing) {
    if (!existing.stock) {
      await tx.stock.upsert({
        where: { productId: existing.id },
        update: {},
        create: { productId: existing.id },
      })
    }
    if (options.defaultRoute) {
      const routes = ('processRoutes' in existing ? existing.processRoutes : []) as unknown as Array<{ id: string; steps: unknown[] }>
      const defaultRoute = routes[0]
      if (!defaultRoute) {
        await tx.processRoute.create({
          data: {
            productId: existing.id,
            name: '简易生产路线',
            isDefault: true,
            sortOrder: routeSortOrder,
            steps: { create: [{ stepNo: 1, name: '简易作业', workstation: '现场' }] },
          },
        })
      } else if (defaultRoute.steps.length === 0) {
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
      name: material.name,
      category: material.category,
      customerId: material.customerId || null,
      unit: material.stockUnit || material.unit,
      description: options.description || `由物料 ${material.code} 自动映射，用于兼容旧业务表。`,
      stock: { create: {} },
      ...(options.defaultRoute
        ? {
            processRoutes: {
              create: {
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
    select: { code: true, name: true, category: true, customerId: true, stockUnit: true, unit: true, deletedAt: true },
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
    select: { sku: true },
  })
  if (!product) return null

  const materialCodes = product.sku.startsWith('MAT-')
    ? [product.sku, product.sku.slice(4)]
    : [product.sku]
  const material = await tx.material.findFirst({
    where: {
      code: { in: materialCodes },
      deletedAt: null,
    },
    orderBy: { code: 'asc' },
    select: { id: true },
  })
  return material?.id || null
}
