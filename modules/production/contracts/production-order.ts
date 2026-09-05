export type ProductionOrderMode = 'orders' | 'create' | 'detail'

export interface ProductionOrderBomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
  costRuns: ProductionOrderCostRunOption[]
}

export interface ProductionOrderCostRunOption {
  id: string
  processRouteId?: string | null
  processRouteName?: string | null
  unitCost: number
  totalCost: number
  quantityBasis: number
  createdAt: string
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
  processRouteId?: string | null
  processRouteName?: string | null
  processRouteSnapshot?: {
    name: string
    steps: Array<{ id: string; stepNo: number; name: string; workCenter: { id: string; code: string; name: string } | null }>
  } | null
  bomCostRunId?: string | null
  bomCostSnapshot?: {
    unitCost: number
    totalCost: number
    totalMaterialCost: number
    totalLaborCost: number
    totalMachineCost: number
  } | null
}

export interface ProductionOrderDraftLine {
  id: string
  targetId: string
  bomId?: string
  bomCostRunId?: string
  planQty: number
}

export interface CreateProductionOrdersInput {
  items: Array<Omit<ProductionOrderDraftLine, 'id'>>
  voucherNo?: string
  note?: string
  bomCostRunId?: string
}

export interface CreateProductionOrdersResult {
  data: ProductionOrder
  items: ProductionOrder[]
  count: number
  groupNo?: string | null
}
