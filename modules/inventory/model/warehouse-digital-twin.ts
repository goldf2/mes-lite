import type { InventoryLocationOption } from '../contracts/stock'

export type WarehouseTwinStatus = 'EMPTY' | 'AVAILABLE' | 'QUARANTINE' | 'HOLD' | 'REWORK'

export interface WarehouseTwinMaterialBalance {
  stockId: string
  materialId: string | null
  code: string
  name: string
  spec: string | null
  unit: string
  qty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
  reworkQty: number
}

export interface WarehouseTwinLocation {
  id: string
  code: string
  name: string
  isDefault: boolean
  status: WarehouseTwinStatus
  materials: WarehouseTwinMaterialBalance[]
}

export interface WarehouseDigitalTwin {
  locations: WarehouseTwinLocation[]
  occupiedLocationCount: number
  materialLineCount: number
  statusLocationCounts: Record<WarehouseTwinStatus, number>
  integrityIssueTypeCount: number
}

export interface WarehouseTwinStockFact {
  id: string
  material?: {
    id: string
    code: string
    name: string
    spec?: string | null
    unit: string
    stockUnit: string
  } | null
  product?: {
    sku: string
    name: string
    unit: string
  } | null
  locationBalances: Array<{
    locationId: string
    qty: number
    availableQty: number
    quarantineQty: number
    holdQty: number
    reworkQty: number
  }>
}

const positive = (value: number) => Number(value || 0) > 0.000001

function locationStatus(materials: WarehouseTwinMaterialBalance[]): WarehouseTwinStatus {
  if (materials.some((item) => positive(item.holdQty))) return 'HOLD'
  if (materials.some((item) => positive(item.quarantineQty))) return 'QUARANTINE'
  if (materials.some((item) => positive(item.reworkQty))) return 'REWORK'
  if (materials.some((item) => positive(item.qty))) return 'AVAILABLE'
  return 'EMPTY'
}

export function buildWarehouseDigitalTwin(
  stocks: WarehouseTwinStockFact[],
  locations: InventoryLocationOption[],
  integrityIssueTypeCount = 0,
): WarehouseDigitalTwin {
  const materialsByLocation = new Map<string, WarehouseTwinMaterialBalance[]>()

  for (const stock of stocks) {
    const owner = stock.material
      ? {
          materialId: stock.material.id,
          code: stock.material.code,
          name: stock.material.name,
          spec: stock.material.spec || null,
          unit: stock.material.stockUnit || stock.material.unit,
        }
      : stock.product
        ? {
            materialId: null,
            code: stock.product.sku,
            name: stock.product.name,
            spec: null,
            unit: stock.product.unit,
          }
        : null
    if (!owner) continue

    for (const balance of stock.locationBalances) {
      if (!positive(balance.qty)
        && !positive(balance.availableQty)
        && !positive(balance.quarantineQty)
        && !positive(balance.holdQty)
        && !positive(balance.reworkQty)) continue
      const rows = materialsByLocation.get(balance.locationId) || []
      rows.push({
        stockId: stock.id,
        ...owner,
        qty: Number(balance.qty || 0),
        availableQty: Number(balance.availableQty || 0),
        quarantineQty: Number(balance.quarantineQty || 0),
        holdQty: Number(balance.holdQty || 0),
        reworkQty: Number(balance.reworkQty || 0),
      })
      materialsByLocation.set(balance.locationId, rows)
    }
  }

  const twinLocations = locations
    .filter((location) => location.isActive)
    .map((location) => {
      const materials = (materialsByLocation.get(location.id) || [])
        .sort((left, right) => right.qty - left.qty || left.code.localeCompare(right.code))
      return {
        id: location.id,
        code: location.code,
        name: location.name,
        isDefault: Boolean(location.isDefault),
        status: locationStatus(materials),
        materials,
      }
    })
    .sort((left, right) => left.code.localeCompare(right.code))

  const statusLocationCounts: Record<WarehouseTwinStatus, number> = {
    EMPTY: 0,
    AVAILABLE: 0,
    QUARANTINE: 0,
    HOLD: 0,
    REWORK: 0,
  }
  for (const location of twinLocations) statusLocationCounts[location.status] += 1

  return {
    locations: twinLocations,
    occupiedLocationCount: twinLocations.filter((location) => location.materials.length > 0).length,
    materialLineCount: twinLocations.reduce((total, location) => total + location.materials.length, 0),
    statusLocationCounts,
    integrityIssueTypeCount,
  }
}

export function warehouseTwinLocationMatches(location: WarehouseTwinLocation, keyword: string) {
  const normalized = keyword.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [
    location.code,
    location.name,
    ...location.materials.flatMap((item) => [item.code, item.name, item.spec || '']),
  ].some((value) => value.toLocaleLowerCase().includes(normalized))
}
