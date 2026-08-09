export interface EquipmentWorkCenterOption {
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface EquipmentItem {
  id: string
  code: string
  name: string
  equipmentType: string
  model?: string | null
  manufacturer?: string | null
  serialNumber?: string | null
  status: string
  location?: string | null
  basicParameters?: string | null
  note?: string | null
  workCenterId: string
  workCenter: EquipmentWorkCenterOption
  createdAt: string
}

export interface EquipmentForm {
  code: string
  name: string
  equipmentType: string
  workCenterId: string
  model: string
  manufacturer: string
  serialNumber: string
  status: string
  location: string
  basicParameters: string
  note: string
}
