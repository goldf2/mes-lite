export type WarehousePackagingType = 'CARTON' | 'METAL_CAGE' | 'PLASTIC_BOX' | 'OTHER'

export interface WarehousePackageMaterial {
  id: string
  code: string
  name: string
  spec?: string | null
  stockUnit: string
  customerId?: string | null
}

export interface WarehousePackageLocation { id: string; code: string; name: string }

export interface WarehousePackageItem {
  id: string
  materialId: string
  inventoryLotId: string
  quantity: number
  unitSnapshot: string
  lotNoSnapshot: string
  material: WarehousePackageMaterial
}

export interface WarehousePackage {
  id: string
  packageNo: string
  sourceType?: string
  status: string
  contentVersion: number
  packagingType: WarehousePackagingType
  packedBy: string
  packedAt: string
  productionPersonnel: string[]
  qualityPersonnel: string[]
  lengthMm?: number | null
  widthMm?: number | null
  heightMm?: number | null
  grossWeight?: number | null
  netWeight?: number | null
  note?: string | null
  createdAt: string
  items: WarehousePackageItem[]
  placement: { locationId: string; location: WarehousePackageLocation; positionXmm?: number | null; positionYmm?: number | null; positionZmm?: number | null; version: number } | null
  labelRevision?: WarehousePackageLabelRevision | null
  shipmentAllocation?: { shipmentId: string; shipmentNo: string; status: string } | null
}

export interface WarehousePackageList {
  items: WarehousePackage[]
  total: number
  page: number
  pageSize: number
}

export interface WarehousePackingOption {
  inventoryLotId: string
  lotNo: string
  materialId: string
  material: WarehousePackageMaterial
  locationId: string
  location: WarehousePackageLocation
  unpackedQty: number
  productionPersonnel: string[]
  qualityPersonnel: string[]
}

export interface WarehousePackageLabelRevision {
  id: string
  contentVersion: number
  qrValue: string
  createdAt: string
  payload?: { title: string; code: string; description: string; details: string[]; layout?: 'packing'; fields?: Array<{ label: string; value: string }>; qrValue?: string }
}

export interface WarehousePackageForm {
  productionPersonnel?: string[]
  qualityPersonnel?: string[]
  clientRequestId?: string
  inventoryLotId: string
  locationId: string
  quantity: number
  packagingType: WarehousePackagingType
  packedBy: string
  packedAt: string
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  grossWeight?: number
  netWeight?: number
  note?: string
}
