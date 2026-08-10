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
  referenceMeasure?: string | null
  valuationUnit?: string | null
  conversionRate?: number | null
  unitVersion?: number | null
}

const defaultEntryUnitByMeasure: Record<string, string> = {
  LENGTH: 'mm',
  WEIGHT: 'g',
}

function stockUnitOf(material: BomUnitMaterial) {
  return String(material.stockUnit || material.unit || '件').trim()
}

function valuationUnitOf(material: BomUnitMaterial) {
  return String(material.valuationUnit || stockUnitOf(material)).trim()
}

function catalogUnitByCode<T extends BomCatalogUnit>(catalog: T[], code?: string | null) {
  const normalized = normalizeUnitCode(code)
  return catalog.find((unit) => normalizeUnitCode(unit.code) === normalized)
}

function canUseReferenceMeasure(material: BomUnitMaterial) {
  const rate = Number(material.conversionRate)
  return Boolean(
    material.referenceMeasure
      && material.referenceMeasure !== material.primaryMeasure
      && material.valuationUnit
      && Number.isFinite(rate)
      && rate > 0,
  )
}

export function bomEntryUnitOptions<T extends BomCatalogUnit>(catalog: T[], material: BomUnitMaterial): T[] {
  if (!material.primaryMeasure) return []
  const measures = new Set([material.primaryMeasure])
  if (canUseReferenceMeasure(material) && material.referenceMeasure) measures.add(material.referenceMeasure)
  return catalog.filter((unit) => measures.has(unit.measureType))
}

export function defaultBomEntryUnit(
  catalog: BomCatalogUnit[],
  material: BomUnitMaterial,
  preferredCode?: string | null,
) {
  const stockUnit = stockUnitOf(material)
  const configuredCode = findCatalogUnit(catalog, material.primaryMeasure, preferredCode)?.code
  if (configuredCode) return configuredCode
  const fallbackCode = defaultEntryUnitByMeasure[material.primaryMeasure || '']
  return findCatalogUnit(catalog, material.primaryMeasure, fallbackCode)?.code || stockUnit
}

export function convertBomEntryQuantity(
  value: number,
  fromCode: string,
  toCode: string,
  material: BomUnitMaterial,
  catalog: BomCatalogUnit[],
) {
  if (normalizeUnitCode(fromCode) === normalizeUnitCode(toCode)) return Number(value)
  const fromUnit = catalogUnitByCode(catalog, fromCode)
  const toUnit = catalogUnitByCode(catalog, toCode)
  if (!fromUnit || !toUnit) throw new Error('所选单位未在单位配置中启用')
  if (fromUnit.measureType === toUnit.measureType) return convertUnitValue(Number(value), fromUnit, toUnit)
  if (!canUseReferenceMeasure(material)) throw new Error('物料未配置跨量纲换算关系')

  const stockUnit = catalogUnitByCode(catalog, stockUnitOf(material))
  const valuationUnit = catalogUnitByCode(catalog, valuationUnitOf(material))
  if (!stockUnit || !valuationUnit) throw new Error('物料主单位或参考单位未在单位配置中启用')
  const rate = Number(material.conversionRate)

  if (fromUnit.measureType === material.primaryMeasure && toUnit.measureType === material.referenceMeasure) {
    const stockQuantity = convertUnitValue(Number(value), fromUnit, stockUnit)
    return convertUnitValue(stockQuantity * rate, valuationUnit, toUnit)
  }
  if (fromUnit.measureType === material.referenceMeasure && toUnit.measureType === material.primaryMeasure) {
    const valuationQuantity = convertUnitValue(Number(value), fromUnit, valuationUnit)
    return convertUnitValue(valuationQuantity / rate, stockUnit, toUnit)
  }
  throw new Error('所选单位不属于物料允许的计量方式')
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
  const requestedUnit = catalogUnitByCode(input.catalog, requestedCode)

  if (requestedCode === stockCode) {
    return {
      quantity,
      unit: stockUnit,
      entryUnit: requestedUnit?.code || stockUnit,
      entryQuantity: quantity,
      conversionRateUsed: Number(input.material.conversionRate || 1),
      conversionSource: 'MASTER_DEFAULT',
      unitVersionUsed: Number(input.material.unitVersion || 1),
    }
  }

  if (!requestedUnit) throw new Error('所选单位未在单位配置中启用')
  const normalizedQuantity = convertBomEntryQuantity(quantity, requestedUnit.code, stockUnit, input.material, input.catalog)
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) throw new Error('换算后的 BOM 数量必须大于 0')
  return {
    quantity: normalizedQuantity,
    unit: stockUnit,
    entryUnit: requestedUnit.code,
    entryQuantity: quantity,
    conversionRateUsed: Number(input.material.conversionRate || 1),
    conversionSource: requestedUnit.measureType === input.material.primaryMeasure ? 'UNIT_CATALOG' : 'MASTER_DEFAULT',
    unitVersionUsed: Number(input.material.unitVersion || 1),
  }
}

export function bomStoredQuantityToEntry(input: {
  quantity: number
  entryUnit?: string | null
  entryQuantity?: number | null
  material: BomUnitMaterial
  catalog: BomCatalogUnit[]
}) {
  const storedEntryQuantity = Number(input.entryQuantity)
  if (Number.isFinite(storedEntryQuantity) && storedEntryQuantity > 0) return storedEntryQuantity
  const stockUnit = stockUnitOf(input.material)
  const entryUnit = input.entryUnit || stockUnit
  try {
    return convertBomEntryQuantity(input.quantity, stockUnit, entryUnit, input.material, input.catalog)
  } catch {
    return Number(input.quantity)
  }
}
