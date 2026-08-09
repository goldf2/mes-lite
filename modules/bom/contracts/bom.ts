import type { MaterialImage, MeasureType } from '@/modules/materials'

export interface BomMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  unit: string
  stockUnit: string
  valuationUnit: string
  primaryMeasure?: MeasureType
  stockQty?: number
  primaryImage?: MaterialImage | null
}

export interface BomItem {
  id: string
  itemType: string
  quantity: number
  unit: string
  entryUnit?: string | null
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
  isPrimary: boolean
  material: BomMaterialOption
}

export interface BomVersion {
  id: string
  name: string
  purpose: 'PRODUCTION' | 'PACKAGING'
  version: string
  isDefault: boolean
  isActive: boolean
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
