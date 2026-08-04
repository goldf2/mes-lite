import {
  UnitCatalogEntry,
  convertUnitValue,
  findCatalogUnit,
  normalizeUnitCode,
} from './unit-catalog'

type BomCatalogUnit = Pick<UnitCatalogEntry, 'code' | 'name' | 'measureType' | 'toBaseFactor'>

export interface BomUnitMaterial {
  primaryMeasure?: string | null
  stockUnit?: string | null
  unit?: string | null
}

const defaultEntryUnitByMeasure: Record<string, string> = {
  LENGTH: 'mm',
  WEIGHT: 'g',
}

function stockUnitOf(material: BomUnitMaterial) {
  return String(material.stockUnit || material.unit || '件').trim()
}

export function bomEntryUnitOptions<T extends BomCatalogUnit>(catalog: T[], material: BomUnitMaterial): T[] {
  if (!material.primaryMeasure || !defaultEntryUnitByMeasure[material.primaryMeasure]) return []
  return catalog.filter((unit) => unit.measureType === material.primaryMeasure)
}

export function defaultBomEntryUnit(catalog: BomCatalogUnit[], material: BomUnitMaterial) {
  const stockUnit = stockUnitOf(material)
  const preferredCode = defaultEntryUnitByMeasure[material.primaryMeasure || '']
  return findCatalogUnit(catalog, material.primaryMeasure, preferredCode)?.code || stockUnit
}

export function convertBomEntryQuantity(
  value: number,
  fromCode: string,
  toCode: string,
  material: BomUnitMaterial,
  catalog: BomCatalogUnit[],
) {
  if (normalizeUnitCode(fromCode) === normalizeUnitCode(toCode)) return Number(value)
  const fromUnit = findCatalogUnit(catalog, material.primaryMeasure, fromCode)
  const toUnit = findCatalogUnit(catalog, material.primaryMeasure, toCode)
  if (!fromUnit || !toUnit) throw new Error('所选单位不属于物料的主计量方式')
  return convertUnitValue(Number(value), fromUnit, toUnit)
}

export function normalizeBomEntryQuantity(input: {
  quantity: number
  entryUnit?: string | null
  material: BomUnitMaterial
  catalog: BomCatalogUnit[]
}) {
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('BOM 数量必须大于 0')

  const stockUnit = stockUnitOf(input.material)
  const requestedCode = normalizeUnitCode(input.entryUnit || stockUnit)
  const stockCode = normalizeUnitCode(stockUnit)
  const requestedUnit = findCatalogUnit(input.catalog, input.material.primaryMeasure, requestedCode)

  if (requestedCode === stockCode) {
    return {
      quantity,
      unit: stockUnit,
      entryUnit: requestedUnit?.code || stockUnit,
    }
  }

  if (!defaultEntryUnitByMeasure[input.material.primaryMeasure || '']) {
    throw new Error('数量类和其他类物料必须使用主库存单位')
  }
  const stockCatalogUnit = findCatalogUnit(input.catalog, input.material.primaryMeasure, stockCode)
  if (!requestedUnit || !stockCatalogUnit) throw new Error('所选单位与物料主库存单位无法换算')

  const normalizedQuantity = convertUnitValue(quantity, requestedUnit, stockCatalogUnit)
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) throw new Error('换算后的 BOM 数量必须大于 0')
  return {
    quantity: normalizedQuantity,
    unit: stockUnit,
    entryUnit: requestedUnit.code,
  }
}

export function bomStoredQuantityToEntry(input: {
  quantity: number
  entryUnit?: string | null
  material: BomUnitMaterial
  catalog: BomCatalogUnit[]
}) {
  const stockUnit = stockUnitOf(input.material)
  const entryUnit = input.entryUnit || stockUnit
  try {
    return convertBomEntryQuantity(input.quantity, stockUnit, entryUnit, input.material, input.catalog)
  } catch {
    return Number(input.quantity)
  }
}
