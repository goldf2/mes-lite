export type BomMeasureType = 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'

export interface BomMaterialImage {
  id: string
  url: string
  thumbnailUrl?: string
  displayUrl?: string
  originalUrl?: string
  note?: string | null
  mimeType: string
  isCover: boolean
}

export interface BomUnitCatalogItem {
  code: string
  name: string
  measureType: BomMeasureType
  toBaseFactor: number
  isBase?: boolean
  isPreset?: boolean
}

export interface BomMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  unit: string
  stockUnit: string
  valuationUnit: string
  primaryMeasure?: BomMeasureType
  referenceMeasure?: BomMeasureType | null
  conversionRate?: number
  unitVersion?: number
  stockQty?: number
  primaryImage?: BomMaterialImage | null
}

export interface BomItem {
  id: string
  itemType: string
  quantity: number
  unit: string
  entryUnit?: string | null
  entryQuantity?: number | null
  conversionRateUsed?: number | null
  conversionSource?: string | null
  unitVersionUsed?: number | null
  wastageRate: number
  material?: BomMaterialOption | null
  outputMaterialId?: string | null
  outputMaterial?: BomMaterialOption | null
}

export interface BomOutput {
  id: string
  quantity: number
  unit: string
  entryUnit?: string | null
  entryQuantity?: number | null
  conversionRateUsed?: number | null
  conversionSource?: string | null
  unitVersionUsed?: number | null
  isPrimary: boolean
  material: BomMaterialOption
}

export interface BomVersion {
  id: string
  name: string
  purpose: 'PRODUCTION' | 'PACKAGING'
  version: string
  status: 'DRAFT' | 'RELEASED' | 'OBSOLETE'
  isDefault: boolean
  isActive: boolean
  basedOnBomId?: string | null
  changeReason?: string | null
  releasedAt?: string | Date | null
  obsoleteAt?: string | Date | null
  outputQuantity: number
  outputUnit: string
  outputs: BomOutput[]
  items: BomItem[]
}

export interface MaterialBom {
  id: string
  sku: string
  name: string
  description?: string | null
  category: string
  unit: string
  sourceMaterialId?: string
  bom?: BomVersion | null
  boms: BomVersion[]
}

export interface BomSearchRow {
  product: MaterialBom
  bom: BomVersion
  material: BomMaterialOption | null
  materialId: string
}

export interface DraftBomItem {
  clientId: string
  materialId: string
  quantity: number | string
  unit: string
  wastageRate: number
}

export interface DraftBomOutput {
  clientId: string
  materialId: string
  quantity: number | string
  unit: string
}
