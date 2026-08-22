export interface ShipmentPackageItem {
  id: string
  shipmentItemId: string
  materialId: string
  inventoryLotId?: string | null
  quantity: number
  unitSnapshot: string
  lotNoSnapshot?: string | null
  note?: string | null
  material: { id: string; code: string; name: string; spec?: string | null }
  inventoryLot?: { id: string; lotNo: string } | null
}

export interface ShipmentPackage {
  id: string
  packageNo: string
  shipmentId: string
  status: string
  packedBy: string
  packedAt: string
  grossWeight?: number | null
  netWeight?: number | null
  weightUnit: string
  lengthMm?: number | null
  widthMm?: number | null
  heightMm?: number | null
  sealNo?: string | null
  note?: string | null
  createdAt: string
  items: ShipmentPackageItem[]
}

export interface ShipmentPackageForm {
  shipmentItemId: string
  quantity: number
  packedBy: string
  grossWeight?: number
  netWeight?: number
  weightUnit: string
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  sealNo: string
  note: string
}
