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
    type: 'MATERIAL_IN' | 'PRODUCTION_ORDER_ACTUAL_OUTPUT' | 'RETURN_ORDER' | 'LEGACY_INVENTORY' | 'LEGACY_SHIPMENT' | 'OTHER'
    number: string
    supplier?: string | null
    productionOrder?: string | null
    actualNo?: string | null
    shipmentNo?: string | null
    customer?: string | null
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

export type InventoryLotCustomerShipment = {
  id: string
  lotId: string
  shipmentId: string
  shipmentNo: string
  customer: string
  customerCode?: string | null
  status: string
  shippedAt?: string | null
  trackingNo?: string | null
  stockQty: number
  returnedStockQty: number
  location: { id: string; code: string; name: string }
}

export type InventoryLotCustomerReturn = {
  id: string
  direction: 'SOURCE' | 'DESCENDANT'
  returnOrderId: string
  returnNo: string
  status: string
  processedAt?: string | null
  reason: string
  shipmentNo: string
  customer: string
  stockQty: number
  lot: InventoryLotTraceNode
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
  customerShipments: InventoryLotCustomerShipment[]
  returnSources: InventoryLotCustomerReturn[]
  returnDescendants: InventoryLotCustomerReturn[]
}
