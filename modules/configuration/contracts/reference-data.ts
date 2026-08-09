export type PartyKind = 'supplier' | 'customer'

export interface PartyRecord {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  createdAt: string
  sortOrder: number
}

export interface PartyForm {
  name: string
  contact: string
  phone: string
  address: string
}

export type MeasureType = 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'

export interface ConfiguredUnit {
  code: string
  name: string
  measureType: MeasureType
  toBaseFactor: number
  isBase: boolean
  isPreset: boolean
  usedByMaterialCount: number
  usedByBomCount: number
  usageCount: number
  sortOrder: number
}

export interface UnitForm {
  code: string
  name: string
  measureType: MeasureType
  toBaseFactor: number
}

export interface InventoryLocationConfig {
  id: string
  code: string
  name: string
  note?: string | null
  isDefault: boolean
  isActive: boolean
  materialCount: number
  qty: number
  reservedQty: number
  availableQty: number
  sortOrder: number
}

export interface InventoryLocationForm {
  code: string
  name: string
  note: string
  isDefault: boolean
  isActive: boolean
}
