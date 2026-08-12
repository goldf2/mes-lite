export interface Customer {
  id: string
  code: string
  name: string
}

export interface InventoryLocationOption {
  id: string
  code: string
  name: string
  isDefault: boolean
  isActive: boolean
}

export interface StockLocationBalance {
  id: string
  locationId: string
  qty: number
  reservedQty: number
  availableQty: number
  quarantineQty: number
  holdQty: number
  reworkQty: number
  location: InventoryLocationOption
}

export interface PackagingMaterialRef {
  id: string
  code: string
  name: string
  category: string
  stockUnit: string
}

export interface PackagingDefinition {
  bom: { id: string; name: string; version: string }
  outputQuantity: number
  outputUnit: string
  contents: Array<{ material: PackagingMaterialRef; quantity: number }>
}

export interface PackagingInventorySource {
  stockId: string
  material: PackagingMaterialRef
  qty: number
  equivalentQty: number
  ratio: number
  bom: { id: string; name: string; version: string }
  locations: Array<{ locationId: string; code: string; name: string; qty: number; equivalentQty: number }>
}

export interface PackagingInventorySummary {
  material: PackagingMaterialRef
  packagedEquivalentQty: number
  sources: PackagingInventorySource[]
}

export interface Stock {
  id: string
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
  locationBalances: StockLocationBalance[]
  packagingDefinition?: PackagingDefinition | null
  packagingSummary?: PackagingInventorySummary | null
  material?: {
    id: string
    code: string
    name: string
    spec: string
    category?: string
    customerId?: string | null
    customer?: Customer | null
    unit: string
    stockUnit: string
    valuationUnit: string
    conversionRate: number
    deletedAt?: string | null
    primaryImage?: {
      id: string
      url: string
      thumbnailUrl?: string
      displayUrl?: string
      originalUrl?: string
      note?: string | null
      mimeType: string
      isCover: boolean
    } | null
  }
  product?: {
    id: string
    sku: string
    name: string
    category: string
    customerId?: string | null
    customer?: Customer | null
    unit: string
  }
}

export interface StockIntegrityIssue {
  type?: string
  message?: string
  records?: Array<{ id?: string; code?: string; reasons?: string[] }>
}

export interface StockAdjustmentDraft {
  locationId: string
  newLocationQty: number
  newValuationQty: number
  newTotalCost: number
  reason: string
}

export interface StockQuery {
  keyword: string
  customerId: string
  locationId: string
  categories: string[]
  allCategories: readonly { value: string }[]
  includeInvalid: boolean
}

export interface StockAdjustmentInput extends StockAdjustmentDraft {
  stockId: string
  adjustedBy: string
}
