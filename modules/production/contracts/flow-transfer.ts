export interface FlowTransferLocationOption {
  id: string
  code: string
  name: string
  isDefault: boolean
}

export interface FlowTransferMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  category: string
  stockUnit: string
  unit: string
  primaryImage?: { id: string; url: string; thumbnailUrl?: string; displayUrl?: string; originalUrl?: string; note?: string | null } | null
  stock?: {
    qty: number
    availableQty: number
    locationBalances: Array<{
      locationId: string
      qty: number
      reservedQty: number
      availableQty: number
    }>
  } | null
}

export interface FlowTransferEmployeeOption {
  id: string
  code: string
  name: string
  department?: string | null
}

export type FlowTransferStatus = 'DRAFT' | 'CONFIRMED' | 'REVERSED'

export interface FlowTransferRecord {
  id: string
  transferNo: string
  transferDate: string
  quantity: number
  unit: string
  operator: string
  employeeId?: string | null
  employee?: (FlowTransferEmployeeOption & { isActive: boolean }) | null
  note?: string | null
  status: FlowTransferStatus
  confirmedAt?: string | null
  confirmedBy?: string | null
  reversedAt?: string | null
  reversedBy?: string | null
  reverseReason?: string | null
  material: Pick<FlowTransferMaterialOption, 'id' | 'code' | 'name' | 'spec' | 'category' | 'stockUnit' | 'unit'>
  sourceLocation: Pick<FlowTransferLocationOption, 'id' | 'code' | 'name'>
  targetLocation: Pick<FlowTransferLocationOption, 'id' | 'code' | 'name'>
}

export interface FlowTransferForm {
  transferDate: string
  materialId: string
  sourceLocationId: string
  targetLocationId: string
  quantity: number
  employeeId: string
  note: string
}
