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
  materialId: string | null
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

  const materialById = new Map(materials.map((material) => [material.id, material]))
  const productsBySku = new Map(products.map((product) => [product.sku, product]))
  const ambiguousProducts: AmbiguousProductMapping[] = []
  const productChanges: ProductSkuChange[] = []
  for (const product of products) {
    let material = product.materialId ? materialById.get(product.materialId) : undefined
    if (!product.materialId) {
      const normalizedSku = normalizeMaterialCode(product.sku)
      const candidateCodes = normalizedSku.startsWith('MAT-')
        ? [normalizedSku, normalizedSku.slice(4)]
        : [normalizedSku]
      const candidates = candidateCodes.flatMap((code) => finalMaterialGroups.get(code) || [])
      if (candidates.length > 1) {
        ambiguousProducts.push({
          productId: product.id,
          sku: product.sku,
          materialCodes: candidates.map((candidate) => candidate.code).sort(),
        })
        continue
      }
      material = candidates[0]
    }
    if (!material) continue
    const after = normalizeMaterialCode(material.code)
    if (!after || (product.sku === after && product.materialId === material.id)) continue
    productChanges.push({
      id: product.id,
      before: product.sku,
      after,
      materialId: material.id,
      materialCode: material.code,
    })
  }
  ambiguousProducts.sort((left, right) => left.sku.localeCompare(right.sku))
  productChanges.sort((left, right) => left.before.localeCompare(right.before))
  const productChangeById = new Map(productChanges.map((change) => [change.id, change]))

  const finalProductGroups = new Map<string, ProductRow[]>()
  for (const product of products) {
    const finalSku = productChangeById.get(product.id)?.after || product.sku
    const group = finalProductGroups.get(finalSku) || []
    group.push(product)
    finalProductGroups.set(finalSku, group)
  }
  const productConflictGroups = new Map(Array.from(finalProductGroups.entries())
    .filter(([, group]) => group.length > 1 && group.some((product) => productChangeById.has(product.id)))
    .map(([sku, group]) => [sku, new Map(group.map((product) => [product.id, product]))]))
  for (const change of productChanges) {
    const occupyingProduct = productsBySku.get(change.after)
    if (!occupyingProduct || occupyingProduct.id === change.id) continue
    const group = productConflictGroups.get(change.after) || new Map<string, ProductRow>()
    group.set(occupyingProduct.id, occupyingProduct)
    group.set(change.id, productsBySku.get(change.before)!)
    productConflictGroups.set(change.after, group)
  }
  const productConflicts = Array.from(productConflictGroups.entries())
    .map(([normalizedSku, group]) => ({
      normalizedSku,
      products: Array.from(group.values()).map((product) => ({ id: product.id, sku: product.sku })),
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
      select: { id: true, sku: true, materialId: true },
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
      data: { sku: change.after, materialId: change.materialId },
    })
  }

  return {
    changedMaterials: preview.changes.length,
    changedProducts: preview.productChanges.length,
    changes: preview.changes,
    productChanges: preview.productChanges,
  }
}
