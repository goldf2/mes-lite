export type StockMovementDirection = 'in' | 'out' | null

export interface StockMovementQuery {
  keyword: string
  page: number
  pageSize: number
  type: string | null
  direction: StockMovementDirection
  objectCode: string | null
  objectName: string | null
  locationId: string | null
  refType: string | null
  refId: string | null
  operator: string | null
  note: string | null
  createdDate: string | null
  advancedConditions?: import('@/lib/resource-search').ResourceSearchCondition[]
}

export interface StockMovementObject {
  id: string
  code: string
  name: string
  spec: string
  kind: 'material' | 'product'
}

export interface StockMovement {
  id: string
  stockId: string
  type: string
  qty: number
  beforeQty: number
  afterQty: number
  valuationQty: number | null
  beforeValuationQty: number | null
  afterValuationQty: number | null
  costAmount: number | null
  beforeCostAmount: number | null
  afterCostAmount: number | null
  stockUnit: string
  valuationUnit: string
  refType: string | null
  refId: string | null
  note: string | null
  createdAt: string
  createdBy: string | null
  sourceMovementId: string | null
  reversalMovementId: string | null
  object: StockMovementObject
  location: { id: string; code: string; name: string } | null
}

export interface StockMovementFilterOptions {
  types: Array<{ value: string; label: string }>
  refTypes: Array<{ value: string; label: string }>
  locations: Array<{ value: string; label: string }>
}

export interface StockMovementWorkspace {
  items: StockMovement[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  options: StockMovementFilterOptions
}
