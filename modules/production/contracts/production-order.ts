export type ProductionOrderMode = 'orders' | 'create' | 'detail'

export interface ProductionOrderBomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
}

export interface ProductionOrderMaterialOption {
  id: string
  code: string
  name: string
  category: string
  boms: ProductionOrderBomOption[]
}

export interface ProductionOrder {
  id: string
  orderNo: string
  groupNo?: string | null
  lineNo?: number
  voucherNo?: string | null
  status: string
  planQty: number
  completeQty: number
  scrapQty: number
  createdAt: string
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  targetMaterial?: { id: string; name: string; code: string; category?: string; stockUnit?: string; unit?: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null } | null
  bom?: { id: string; name: string; version: string } | null
  bomName?: string | null
  bomVersion?: string | null
  _count: { reports?: number; picks?: number; actuals: number }
}

export interface ProductionOrderDetail extends ProductionOrder {
  groupLines?: ProductionOrder[]
}

export interface ProductionOrderDraftLine {
  id: string
  targetId: string
  bomId?: string
  planQty: number
}

export interface CreateProductionOrdersInput {
  items: Array<Omit<ProductionOrderDraftLine, 'id'>>
  voucherNo?: string
  note?: string
}

export interface CreateProductionOrdersResult {
  data: ProductionOrder
  items: ProductionOrder[]
  count: number
  groupNo?: string | null
}
