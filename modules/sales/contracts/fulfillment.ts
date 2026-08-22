import type { MaterialImage } from '@/modules/materials'

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
  primaryImage?: MaterialImage | null
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
  productId?: string | null
  locationId?: string | null
  customerId?: string | null
  qty: number
  unitPrice: number
  totalAmount: number
  customer: string
  customerPhone?: string
  address?: string
  status: string
  lotTraceStatus: string
  shippedAt?: string
  shippedBy?: string
  trackingNo?: string
  note?: string
  createdAt: string
  product?: { id: string; name: string; sku: string; unit: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null } | null
  customerRef?: { id: string; code: string; name: string } | null
  location?: { id: string; code: string; name: string } | null
  items: ShipmentItem[]
  returnedQty: number
  returnableQty: number
  lotAllocations: Array<{
    id: string
    stockQty: number
    valuationQty: number
    costAmount: number
    returnedStockQty: number
    returnedValuationQty: number
    returnedCostAmount: number
    lot: { id: string; lotNo: string; sourceType: string; supplierLotNo?: string | null; status: string }
    location: { id: string; code: string; name: string }
  }>
  packages: import('./shipment-package').ShipmentPackage[]
}

export interface ShipmentItem {
  id: string
  sortOrder: number
  materialId: string
  locationId: string
  qty: number
  unitSnapshot: string
  unitPrice: number
  totalAmount: number
  returnedQty: number
  returnableQty: number
  material: { id: string; code: string; name: string; spec?: string | null; stockUnit: string; primaryImage?: MaterialImage | null }
  location: InventoryLocationOption
  lotAllocations: Shipment['lotAllocations']
}

export interface ReturnShipmentOption {
  id: string
  shipmentId: string
  shipmentItemId: string
  shipmentNo: string
  material: { id: string; code: string; name: string; spec?: string | null; stockUnit: string }
  location: InventoryLocationOption
  customer: string
  customerRef?: { id: string; code: string; name: string } | null
  status: string
  shippedAt?: string | null
  qty: number
  returnedQty: number
  returnableQty: number
}

export interface CustomerMaterialDeliveryReference {
  customerId: string
  materialId: string
  orderedQty: number
  pendingQty: number
  shippedQty: number
  remainingQty: number
  overQty: number
  unit: string
}

export interface ShipmentForm {
  customerId: string
  voucherNo: string
  trackingNo: string
  shippedBy: string
  note: string
  items: ShipmentFormItem[]
}

export interface ShipmentFormItem {
  id: string
  materialId: string
  unitPrice: number
  locationId: string
  qty: number
}

export interface ShipmentCreated {
  id: string
  shipmentNo: string
}

export interface ReturnOrder {
  id: string
  returnNo: string
  voucherNo?: string | null
  shipmentId: string
  shipmentItemId: string
  productId?: string | null
  qty: number
  reason: string
  status: string
  note?: string
  createdAt: string
  processedAt?: string
  product?: { id: string; name: string; sku: string; unit: string; customerId?: string | null; customer?: { id: string; code: string; name: string } | null } | null
  shipment: { id: string; shipmentNo: string; customerId?: string | null; customer?: string; customerRef?: { id: string; code: string; name: string } | null }
  shipmentItem: ShipmentItem
  location?: InventoryLocationOption | null
  inventoryLot?: {
    id: string
    lotNo: string
    status: string
    balances: Array<{ id: string; inventoryStatus: string; stockQty: number; valuationQty: number; costAmount: number }>
    inspections: Array<{
      id: string
      inspectionNo: string
      status: string
      result: string
      inspectedQty: number
      sampleQty: number
      goodQty: number
      badQty: number
      inspector?: string | null
      checkedAt?: string | null
      note?: string | null
    }>
  } | null
  lotAllocations: Array<{
    id: string
    stockQty: number
    valuationQty: number
    costAmount: number
    shipmentAllocation: {
      id: string
      lot: { id: string; lotNo: string; sourceType: string; supplierLotNo?: string | null; status: string }
      location: { id: string; code: string; name: string }
    }
  }>
}

export interface ReturnForm {
  voucherNo: string
  shipmentId: string
  shipmentItemId: string
  locationId: string
  qty: number
  reason: string
  note: string
}
