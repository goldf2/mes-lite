export interface StockMovementStatsQuery {
  startDate: string | null
  endDate: string | null
  materialId: string | null
  locationId: string | null
}

export interface StockMovementStatsBucket {
  key: string
  label: string
  movementCount: number
  inQty: number
  outQty: number
  netQty: number
  netValuationQty: number
  netCostAmount: number
  stockUnit: string
  valuationUnit: string
}

export interface StockMovementStatsWorkspace {
  range: { startDate: string; endDate: string }
  summary: {
    movementCount: number
    stockUnits: string[]
    inQty: number | null
    outQty: number | null
    netQty: number | null
    netValuationQty: number | null
    netCostAmount: number
    incomingInQty: number | null
    incomingOutQty: number | null
    incomingNetQty: number | null
  }
  byType: StockMovementStatsBucket[]
  byMaterial: Array<StockMovementStatsBucket & {
    objectId: string
    code: string
    name: string
    spec: string
  }>
  byLocation: Array<StockMovementStatsBucket & {
    locationId: string
    code: string
    name: string
  }>
}
