const QUANTITY_TOLERANCE = 0.000001

export interface PackagingMaterialRef {
  id: string
  code: string
  name: string
  category: string
  stockUnit: string
}

export interface PackagingBomRelation {
  id: string
  name: string
  version: string
  output: {
    quantity: number
    material: PackagingMaterialRef
  }
  items: Array<{
    quantity: number
    material: PackagingMaterialRef
  }>
}

export interface PackagingStockBalance {
  stockId: string
  material: PackagingMaterialRef
  qty: number
  locations: Array<{
    locationId: string
    code: string
    name: string
    qty: number
  }>
}

interface ExpandedMaterial {
  material: PackagingMaterialRef
  quantity: number
}

export interface PackagingInventorySource {
  stockId: string
  material: PackagingMaterialRef
  qty: number
  equivalentQty: number
  ratio: number
  bom: { id: string; name: string; version: string }
  locations: Array<{
    locationId: string
    code: string
    name: string
    qty: number
    equivalentQty: number
  }>
}

export interface PackagingInventorySummary {
  material: PackagingMaterialRef
  packagedEquivalentQty: number
  sources: PackagingInventorySource[]
}

export interface PackagingDefinition {
  bom: { id: string; name: string; version: string }
  outputQuantity: number
  outputUnit: string
  contents: Array<{
    material: PackagingMaterialRef
    quantity: number
  }>
}

function roundQuantity(value: number) {
  return Number(value.toFixed(6))
}

export function buildPackagingInventoryAnalysis(
  relations: PackagingBomRelation[],
  stocks: PackagingStockBalance[],
) {
  const relationByOutputMaterialId = new Map(
    relations.map((relation) => [relation.output.material.id, relation]),
  )
  const definitions = new Map<string, PackagingDefinition>()
  for (const relation of relations) {
    definitions.set(relation.output.material.id, {
      bom: { id: relation.id, name: relation.name, version: relation.version },
      outputQuantity: relation.output.quantity,
      outputUnit: relation.output.material.stockUnit,
      contents: relation.items
        .filter((item) => item.material.category !== 'PACKAGING')
        .map((item) => ({ material: item.material, quantity: item.quantity })),
    })
  }

  const expand = (
    material: PackagingMaterialRef,
    quantity: number,
    path: Set<string>,
  ): ExpandedMaterial[] => {
    const relation = relationByOutputMaterialId.get(material.id)
    if (!relation || path.has(material.id) || relation.output.quantity <= QUANTITY_TOLERANCE) {
      return [{ material, quantity }]
    }
    const contents = relation.items.filter((item) => item.material.category !== 'PACKAGING')
    if (contents.length === 0) return [{ material, quantity }]

    const nextPath = new Set(path)
    nextPath.add(material.id)
    const batchFactor = quantity / relation.output.quantity
    return contents.flatMap((item) => expand(
      item.material,
      item.quantity * batchFactor,
      nextPath,
    ))
  }

  const summaryByMaterialId = new Map<string, PackagingInventorySummary>()
  for (const stock of stocks) {
    const relation = relationByOutputMaterialId.get(stock.material.id)
    if (!relation || Math.abs(stock.qty) <= QUANTITY_TOLERANCE) continue

    const expanded = expand(stock.material, stock.qty, new Set())
    const expandedByMaterial = new Map<string, ExpandedMaterial>()
    for (const item of expanded) {
      const current = expandedByMaterial.get(item.material.id)
      expandedByMaterial.set(item.material.id, current
        ? { ...current, quantity: current.quantity + item.quantity }
        : item)
    }

    for (const item of Array.from(expandedByMaterial.values())) {
      if (item.material.id === stock.material.id) continue
      const ratio = item.quantity / stock.qty
      const source: PackagingInventorySource = {
        stockId: stock.stockId,
        material: stock.material,
        qty: roundQuantity(stock.qty),
        equivalentQty: roundQuantity(item.quantity),
        ratio: roundQuantity(ratio),
        bom: { id: relation.id, name: relation.name, version: relation.version },
        locations: stock.locations
          .filter((location) => Math.abs(location.qty) > QUANTITY_TOLERANCE)
          .map((location) => ({
            ...location,
            qty: roundQuantity(location.qty),
            equivalentQty: roundQuantity(location.qty * ratio),
          })),
      }
      const current = summaryByMaterialId.get(item.material.id)
      if (current) {
        current.packagedEquivalentQty = roundQuantity(current.packagedEquivalentQty + item.quantity)
        current.sources.push(source)
      } else {
        summaryByMaterialId.set(item.material.id, {
          material: item.material,
          packagedEquivalentQty: roundQuantity(item.quantity),
          sources: [source],
        })
      }
    }
  }

  return { definitions, summaries: summaryByMaterialId }
}
