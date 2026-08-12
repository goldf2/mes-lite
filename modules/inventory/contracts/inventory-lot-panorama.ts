import type { InventoryLotCustomerShipment, InventoryLotTraceNode } from './inventory-lot-trace'

export type InventoryLotSearchItem = {
  lot: InventoryLotTraceNode
  matchedBy: string[]
}

export type InventoryLotSearchResult = {
  keyword: string
  items: InventoryLotSearchItem[]
  truncated: boolean
}

export type InventoryLotPanoramaNode = {
  lot: InventoryLotTraceNode
  generation: number
}

export type InventoryLotPanoramaEdge = {
  id: string
  type: 'PRODUCTION' | 'CUSTOMER_RETURN'
  sourceLotId: string
  targetLotId: string
  stockQty: number
  documentNo: string
  secondaryDocumentNo?: string | null
  customer?: string | null
}

export type InventoryLotPanorama = {
  selectedLotId: string
  nodes: InventoryLotPanoramaNode[]
  edges: InventoryLotPanoramaEdge[]
  customerShipments: InventoryLotCustomerShipment[]
  summary: {
    lots: number
    relations: number
    supplierLots: number
    customers: number
    qualityInspections: number
  }
  truncated: boolean
}
