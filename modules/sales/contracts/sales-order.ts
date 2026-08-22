import type { MaterialImage } from '@/modules/materials'

export interface SalesCustomerOption {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
}

export interface SalesMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  stockUnit: string
  unit: string
  defaultSalePrice?: number | null
  salesCurrency: string
  primaryImage?: MaterialImage | null
}

export interface SalesOrderItem {
  id: string
  qty: number
  shippedQty: number
  referenceOrderedQty: number
  referencePendingQty: number
  referenceShippedQty: number
  referenceRemainingQty: number
  referenceOverQty: number
  unit: string
  unitPrice: number
  totalAmount: number
  currency: string
  priceSource: string
  defaultSalePriceSnapshot?: number | null
  priceAdjustedAt?: string | null
  priceAdjustedBy?: string | null
  priceAdjustReason?: string | null
  note?: string | null
  material: SalesMaterialOption
}

export interface SalesOrder {
  id: string
  orderNo: string
  voucherNo?: string | null
  status: string
  orderDate: string
  deliveryDate?: string | null
  totalAmount: number
  currency: string
  note?: string | null
  customer: SalesCustomerOption
  items: SalesOrderItem[]
}

export interface SalesOrderDraftLine {
  key: string
  materialId: string
  qty: number
  unitPrice: number
  note: string
}

export interface SalesOrderDraft {
  voucherNo: string
  customerId: string
  orderDate: string
  deliveryDate: string
  note: string
  items: SalesOrderDraftLine[]
}

export interface SalesOrderPriceEdit {
  order: SalesOrder
  items: Array<{ id: string; materialLabel: string; qty: number; unit: string; unitPrice: number }>
  reason: string
}

export interface CreateSalesOrderInput extends Omit<SalesOrderDraft, 'items'> {
  items: Array<Omit<SalesOrderDraftLine, 'key'>>
}

export interface UpdateSalesOrderPricesInput {
  reason?: string
  items: Array<{ id: string; unitPrice: number }>
}

export interface SalesOrderOptions {
  customers: SalesCustomerOption[]
  materials: SalesMaterialOption[]
}
