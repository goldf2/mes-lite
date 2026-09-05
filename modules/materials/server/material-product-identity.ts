import { prisma } from '@/lib/prisma'

type IdentityResolver = Pick<typeof prisma, 'material' | 'product'>
type ProductIdentity = { id: string; sku: string; materialId?: string | null }

export function legacyMaterialCodes(sku: string) {
  return sku.startsWith('MAT-') ? [sku, sku.slice(4)] : [sku]
}

// Legacy codes are candidates, never aliases: a real MAT-A and A are distinct materials.
export async function getProductMaterials<T extends ProductIdentity>(tx: IdentityResolver, products: T[]) {
  const ids = products.flatMap((p) => p.materialId ? [p.materialId] : [])
  const codes = products.flatMap((p) => legacyMaterialCodes(p.sku))
  const materials = await tx.material.findMany({
    where: { OR: [{ id: { in: ids } }, { code: { in: codes } }] },
    select: { id: true, code: true, deletedAt: true },
  })
  const byId = new Map(materials.map((m) => [m.id, m]))
  const byCode = new Map(materials.map((m) => [m.code, m]))
  const result = new Map<string, (typeof materials)[number]>()
  for (const product of products) {
    if (product.materialId) {
      const material = byId.get(product.materialId)
      if (material) result.set(product.id, material)
      continue
    }
    const candidates = legacyMaterialCodes(product.sku).flatMap((code) => byCode.has(code) ? [byCode.get(code)!] : [])
    if (candidates.length === 1) result.set(product.id, candidates[0])
  }
  return result
}

export async function getProductsByMaterialId<T extends ProductIdentity>(tx: IdentityResolver, products: T[]) {
  const materials = await getProductMaterials(tx, products)
  const materialIds = Array.from(new Set(Array.from(materials.values()).map((m) => m.id)))
  const codes = Array.from(new Set(Array.from(materials.values()).flatMap((m) => [m.code, `MAT-${m.code}`])))
  const peers = materialIds.length ? await tx.product.findMany({
    where: { OR: [{ materialId: { in: materialIds } }, { materialId: null, sku: { in: codes } }] },
    select: { id: true, sku: true, materialId: true },
  }) : []
  const peerMaterials = await getProductMaterials(tx, peers)
  const claimsByMaterial = new Map<string, typeof peers>()
  for (const peer of peers) {
    const materialId = peerMaterials.get(peer.id)?.id
    if (materialId) claimsByMaterial.set(materialId, [...(claimsByMaterial.get(materialId) || []), peer])
  }
  const result = new Map<string, T>()
  for (const product of products) {
    const material = materials.get(product.id)
    if (!material) continue
    const claims = claimsByMaterial.get(material.id) || []
    const explicit = claims.find((p) => p.materialId === material.id)
    if (explicit ? explicit.id === product.id : claims.length === 1 && claims[0].id === product.id) {
      result.set(material.id, product)
    }
  }
  return result
}

export async function canonicalizeProductCodes<T extends ProductIdentity>(tx: IdentityResolver, products: T[]): Promise<T[]> {
  const materials = await getProductMaterials(tx, products)
  return products.map((product) => ({ ...product, sku: materials.get(product.id)?.code ?? product.sku }))
}
