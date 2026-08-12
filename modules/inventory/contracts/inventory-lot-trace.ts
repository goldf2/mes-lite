export type InventoryLotTraceNode = {
  id: string
  lotNo: string
  material: { id: string; code: string; name: string; stockUnit: string; unit: string }
  sourceType: string
  sourceId: string
  supplierLotNo?: string | null
  status: string
  receivedAt: string
  sourceDocument: {
    type: 'MATERIAL_IN' | 'PRODUCTION_ORDER_ACTUAL_OUTPUT' | 'LEGACY_INVENTORY' | 'OTHER'
    number: string
    supplier?: string | null
    productionOrder?: string | null
    actualNo?: string | null
  }
  balances: Array<{
    location: { id: string; code: string; name: string }
    inventoryStatus: string
    stockQty: number
    valuationQty: number
    costAmount: number
  }>
  inspections: Array<{
    inspectionNo: string
    status: string
    result: string
    sampleQty: number
    goodQty: number
    badQty: number
    inspector?: string | null
    checkedAt?: string | null
    note?: string | null
  }>
}

export type InventoryLotTraceRelation = {
  id: string
  direction: 'UPSTREAM' | 'DOWNSTREAM'
  stockQty: number
  materialCode: string
  materialName: string
  actualNo: string
  orderNo: string
  lot: InventoryLotTraceNode
}

export type InventoryLotTrace = {
  lot: InventoryLotTraceNode
  upstream: InventoryLotTraceRelation[]
  downstream: InventoryLotTraceRelation[]
}
