export interface PanoramaCostRunReference {
  id: string
  productId: string
  materialId?: string | null
  bomId?: string | null
  bomVersion?: string | null
  createdAt: Date | string
}

export interface PanoramaBomReference {
  id: string
  productId: string
  version: string
}

function timestamp(value: Date | string) {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(result) ? result : 0
}

/**
 * Resolve cost snapshots to the BOM they can safely represent in a material panorama.
 *
 * Historical snapshots may have no bomId. They are only attached when the snapshot's
 * product and (when present) BOM version identify exactly one current BOM. A missing
 * version is accepted only when that product has one BOM; otherwise it remains hidden
 * from per-BOM panels instead of being guessed into the newest BOM.
 */
export function resolvePanoramaCostRuns<T extends PanoramaCostRunReference>(
  boms: readonly PanoramaBomReference[],
  runs: readonly T[],
  materialId: string,
) {
  const bomById = new Map(boms.map((bom) => [bom.id, bom]))
  const bomsByProduct = new Map<string, PanoramaBomReference[]>()
  for (const bom of boms) bomsByProduct.set(bom.productId, [...(bomsByProduct.get(bom.productId) || []), bom])

  const sortedRuns = [...runs].sort((left, right) => {
    const dateDifference = timestamp(right.createdAt) - timestamp(left.createdAt)
    return dateDifference || right.id.localeCompare(left.id)
  })
  const runsByBom = new Map<string, T>()
  let unresolvedLegacyRunCount = 0

  for (const run of sortedRuns) {
    if (run.materialId && run.materialId !== materialId) {
      if (!run.bomId) unresolvedLegacyRunCount += 1
      continue
    }

    let matchedBom = run.bomId ? bomById.get(run.bomId) : undefined
    if (matchedBom && matchedBom.productId !== run.productId) matchedBom = undefined

    if (!run.bomId) {
      const candidates = bomsByProduct.get(run.productId) || []
      const versionMatches = run.bomVersion
        ? candidates.filter((bom) => bom.version === run.bomVersion)
        : []
      matchedBom = versionMatches.length === 1
        ? versionMatches[0]
        : !run.bomVersion && candidates.length === 1
          ? candidates[0]
          : undefined
      if (!matchedBom) {
        unresolvedLegacyRunCount += 1
        continue
      }
    }

    if (matchedBom && !runsByBom.has(matchedBom.id)) runsByBom.set(matchedBom.id, run)
  }

  return { runsByBom, unresolvedLegacyRunCount }
}
