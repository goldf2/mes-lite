export interface FulfillmentCustomer {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
}

export interface InventoryLocationOption {
  id: string
  code: string
  name: string
  isDefault: boolean
}

export interface ShipmentMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  stockUnit?: string
  unit: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  defaultSalePrice?: number | null
  salesCurrency?: string
  stock?: { locationBalances: Array<{ locationId: string; availableQty: number }> } | null
}

export interface ReturnMaterialOption {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
}

export interface Shipment {
  id: string
  shipmentNo: string
  voucherNo?: string | null
  productId: string
  locationId?: string | null
  customerId?: string | null
  qty: number
  unitPrice: number
  totalAmount: number
  customer: string
  customerPhone?: string
  address?: string
  status: string
  shippedAt?: string
  shippedBy?: string
  trackingNo?: string
  note?: string
  createdAt: string
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  customerRef?: { id: string; code: string; name: string } | null
  location?: { id: string; code: string; name: string } | null
  salesOrder?: { id: string; orderNo: string; voucherNo?: string | null } | null
}

export interface ShippableSalesItem {
  id: string
  salesOrderId: string
  remainingQty: number
  unit: string
  salesOrder: { id: string; orderNo: string; voucherNo?: string | null; customer: FulfillmentCustomer }
  material: ShipmentMaterialOption
}

export interface ShipmentForm {
  salesOrderItemId: string
  materialId: string
  customerId: string
  voucherNo: string
  unitPrice: number
  locationId: string
  qty: number
  trackingNo: string
  shippedBy: string
  note: string
}

export interface ShipmentCreated {
  id: string
  shipmentNo: string
}

export interface ReturnOrder {
  id: string
  returnNo: string
  voucherNo?: string | null
  shipmentId?: string
  productId: string
  qty: number
  reason: string
  status: string
  note?: string
  createdAt: string
  processedAt?: string
  product: { id: string; name: string; sku: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null }
  shipment?: { id: string; shipmentNo: string; customerId?: string | null; customerRef?: { id: string; code: string; name: string } | null } | null
  location?: InventoryLocationOption | null
}

export interface ReturnForm {
  voucherNo: string
  productId: string
  locationId: string
  qty: number
  reason: string
  note: string
}
