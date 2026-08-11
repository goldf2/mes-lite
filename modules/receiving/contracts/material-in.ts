import type { MaterialInPriceUnit } from '@/lib/material-in-quantity'

export interface SupplierOption {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
}

export interface CustomerOption {
  id: string
  code: string
  name: string
}

export interface InventoryLocationOption {
  id: string
  code: string
  name: string
  isDefault: boolean
}

export type MaterialMeasure = 'LENGTH' | 'WEIGHT' | 'QUANTITY' | 'OTHER'

export interface ReceivingMaterialOption {
  id: string
  code: string
  name: string
  spec?: string
  primaryMeasure: MaterialMeasure
  referenceMeasure?: MaterialMeasure | null
  unit: string
  stockUnit: string
  valuationUnit: string
  conversionRate: number
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
}

export interface MaterialInConversionHistory {
  materialId: string
  stockUnit: string
  valuationUnit: string
  unitVersion: number
  minimumSamples: number
  sampleCount: number
  rate: number | null
  available: boolean
}

export interface MaterialInLineRecord {
  id: string
  inboundNo: string
  receiptId?: string | null
  lineNo: number
  voucherNo?: string | null
  supplierId: string
  materialId: string
  locationId: string
  qty: number
  unit: string
  pieceCount?: number | null
  stockQtyMode: 'TOTAL' | 'PER_PIECE'
  stockQtyInput?: number | null
  totalLength?: number | null
  totalWeight?: number | null
  valuationQty: number
  valuationUnit: string
  conversionRate: number
  conversionSource?: string
  conversionSampleCount?: number
  unitVersionUsed?: number | null
  stockUnitCost: number
  valuationUnitCost: number
  unitPrice: number
  priceBasis: string
  priceUnit?: string
  totalAmount: number
  batchNo?: string
  status: string
  inboundDate: string
  receivedBy?: string
  note?: string
  supplier: { id: string; code: string; name: string }
  material: ReceivingMaterialOption
  location?: InventoryLocationOption | null
}

export interface MaterialInRecord {
  id: string
  inboundNo: string
  voucherNo?: string | null
  supplierId: string
  stagingLocationId: string
  locationId: string
  status: string
  inboundDate: string
  receivedBy?: string | null
  note?: string | null
  totalAmount: number
  itemCount: number
  supplier: { id: string; code: string; name: string }
  location: InventoryLocationOption
  items: MaterialInLineRecord[]
}

export interface MaterialInDraftItem {
  id: string
  materialId: string
  locationId: string
  qty: number
  valuationQty?: number
  unit: string
  valuationUnit: string
  unitPrice: number
  totalAmount: number
  priceUnit: MaterialInPriceUnit
  priceBasis: 'VALUATION' | 'STOCK'
  batchNo?: string
}

export interface MaterialInFormState {
  voucherNo: string
  supplierId: string
  materialId: string
  locationId: string
  qty: number
  valuationQty: number
  unitPrice: number
  priceUnit: MaterialInPriceUnit
  totalAmount: number
  priceInputMode: 'UNIT' | 'TOTAL'
  batchNo: string
  receivedBy: string
  note: string
}

export interface MaterialInPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
