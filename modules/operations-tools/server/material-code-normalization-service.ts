import { prisma } from '@/lib/prisma'

type MaterialCodeClient = Pick<typeof prisma, 'material' | 'product'>

export type MaterialCodeChange = {
  id: string
  name: string
  archived: boolean
  before: string
  after: string
}

export type ProductSkuChange = {
  id: string
  before: string
  after: string
  materialId: string
  materialCode: string
}

export type MaterialCodeConflict = {
  normalizedCode: string
  materials: Array<{ id: string; code: string; name: string; archived: boolean }>
}

export type ProductSkuConflict = {
  normalizedSku: string
  products: Array<{ id: string; sku: string }>
}

export type AmbiguousProductMapping = {
  productId: string
  sku: string
  materialCodes: string[]
}

export type MaterialCodeNormalizationPreview = {
  totalMaterials: number
  pendingMaterialCount: number
  pendingProductCount: number
  invalidMaterials: Array<{ id: string; code: string; name: string; archived: boolean }>
  materialConflicts: MaterialCodeConflict[]
  productConflicts: ProductSkuConflict[]
  ambiguousProducts: AmbiguousProductMapping[]
  changes: MaterialCodeChange[]
  productChanges: ProductSkuChange[]
  canExecute: boolean
}

type MaterialRow = {
  id: string
  code: string
  name: string
  deletedAt: Date | null
}

type ProductRow = {
  id: string
  sku: string
}

export function normalizeMaterialCode(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

export function buildMaterialCodeNormalizationPreview(
  materials: MaterialRow[],
  products: ProductRow[],
): MaterialCodeNormalizationPreview {
  const invalidMaterials = materials
    .filter((material) => normalizeMaterialCode(material.code).length === 0)
    .map((material) => ({
      id: material.id,
      code: material.code,
      name: material.name,
      archived: Boolean(material.deletedAt),
    }))

  const finalMaterialGroups = new Map<string, MaterialRow[]>()
  for (const material of materials) {
    const normalized = normalizeMaterialCode(material.code)
    if (!normalized) continue
    const group = finalMaterialGroups.get(normalized) || []
    group.push(material)
    finalMaterialGroups.set(normalized, group)
  }

  const materialConflicts = Array.from(finalMaterialGroups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([normalizedCode, group]) => ({
      normalizedCode,
      materials: group.map((material) => ({
        id: material.id,
        code: material.code,
        name: material.name,
        archived: Boolean(material.deletedAt),
      })),
    }))
    .sort((left, right) => left.normalizedCode.localeCompare(right.normalizedCode))

  const changes: MaterialCodeChange[] = materials
    .map((material) => ({
      id: material.id,
      name: material.name,
      archived: Boolean(material.deletedAt),
      before: material.code,
      after: normalizeMaterialCode(material.code),
    }))
    .filter((change) => change.after && change.before !== change.after)
    .sort((left, right) => left.before.localeCompare(right.before))

  const productsBySku = new Map(products.map((product) => [product.sku, product]))
  const claimsByProductId = new Map<string, ProductSkuChange[]>()
  for (const change of changes) {
    const candidates = [
      { before: change.before, after: change.after },
      { before: `MAT-${change.before}`, after: `MAT-${change.after}` },
    ]
    for (const candidate of candidates) {
      const product = productsBySku.get(candidate.before)
      if (!product || candidate.before === candidate.after) continue
      const claims = claimsByProductId.get(product.id) || []
      claims.push({
        id: product.id,
        before: product.sku,
        after: candidate.after,
        materialId: change.id,
        materialCode: change.before,
      })
      claimsByProductId.set(product.id, claims)
    }
  }

  const ambiguousProducts = Array.from(claimsByProductId.entries())
    .filter(([, claims]) => new Set(claims.map((claim) => claim.materialId)).size > 1)
    .map(([productId, claims]) => ({
      productId,
      sku: claims[0].before,
      materialCodes: Array.from(new Set(claims.map((claim) => claim.materialCode))).sort(),
    }))
    .sort((left, right) => left.sku.localeCompare(right.sku))
  const ambiguousProductIds = new Set(ambiguousProducts.map((item) => item.productId))

  const productChanges = Array.from(claimsByProductId.values())
    .filter((claims) => !ambiguousProductIds.has(claims[0].id))
    .map((claims) => claims[0])
    .sort((left, right) => left.before.localeCompare(right.before))
  const productChangeById = new Map(productChanges.map((change) => [change.id, change]))

  const finalProductGroups = new Map<string, ProductRow[]>()
  for (const product of products) {
    const finalSku = productChangeById.get(product.id)?.after || product.sku
    const group = finalProductGroups.get(finalSku) || []
    group.push(product)
    finalProductGroups.set(finalSku, group)
  }
  const productConflicts = Array.from(finalProductGroups.entries())
    .filter(([, group]) => group.length > 1 && group.some((product) => productChangeById.has(product.id)))
    .map(([normalizedSku, group]) => ({
      normalizedSku,
      products: group.map((product) => ({ id: product.id, sku: product.sku })),
    }))
    .sort((left, right) => left.normalizedSku.localeCompare(right.normalizedSku))

  const canExecute = invalidMaterials.length === 0
    && materialConflicts.length === 0
    && productConflicts.length === 0
    && ambiguousProducts.length === 0

  return {
    totalMaterials: materials.length,
    pendingMaterialCount: changes.length,
    pendingProductCount: productChanges.length,
    invalidMaterials,
    materialConflicts,
    productConflicts,
    ambiguousProducts,
    changes,
    productChanges,
    canExecute,
  }
}

export async function getMaterialCodeNormalizationPreview(
  client: MaterialCodeClient = prisma,
) {
  const [materials, products] = await Promise.all([
    client.material.findMany({
      select: { id: true, code: true, name: true, deletedAt: true },
      orderBy: { code: 'asc' },
    }),
    client.product.findMany({
      select: { id: true, sku: true },
      orderBy: { sku: 'asc' },
    }),
  ])
  return buildMaterialCodeNormalizationPreview(materials, products)
}

export async function applyMaterialCodeNormalization(
  client: MaterialCodeClient,
  preview: MaterialCodeNormalizationPreview,
) {
  if (!preview.canExecute) {
    throw new Error('物料编码规范化存在冲突，不能执行')
  }

  for (const change of preview.changes) {
    await client.material.update({
      where: { id: change.id },
      data: { code: change.after },
    })
  }
  for (const change of preview.productChanges) {
    await client.product.update({
      where: { id: change.id },
      data: { sku: change.after },
    })
  }

  return {
    changedMaterials: preview.changes.length,
    changedProducts: preview.productChanges.length,
    changes: preview.changes,
    productChanges: preview.productChanges,
  }
}
