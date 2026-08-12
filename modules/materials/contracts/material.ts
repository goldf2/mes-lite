export type MeasureType = 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'

export interface MaterialImage {
  id: string
  url: string
  thumbnailUrl?: string
  displayUrl?: string
  originalUrl?: string
  note?: string | null
  mimeType: string
  isCover: boolean
}

export interface Material {
  id: string
  code: string
  name: string
  spec: string
  note?: string | null
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  primaryMeasure: MeasureType
  referenceMeasure?: MeasureType | null
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  conversionNote?: string
  costingMethod: string
  defaultSalePrice?: number | null
  salesCurrency: string
  stock?: {
    qty: number
    reservedQty: number
    availableQty: number
    quarantineQty: number
    holdQty: number
    reworkQty: number
    valuationQty: number
    reservedValuationQty: number
    availableValuationQty: number
    quarantineValuationQty: number
    holdValuationQty: number
    reworkValuationQty: number
    totalCost: number
    quarantineCost: number
    holdCost: number
    reworkCost: number
    valuationUnitCost: number
    stockUnitCost: number
  }
  primaryImage?: MaterialImage | null
  createdAt: string
}

export interface CustomerOption {
  id: string
  code: string
  name: string
}

export interface ConfiguredUnit {
  code: string
  name: string
  measureType: MeasureType
  toBaseFactor: number
  isBase: boolean
  isPreset: boolean
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
