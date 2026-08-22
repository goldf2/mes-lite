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
  _count: { events: number }
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
  location: string
  basicParameters: string
  note: string
}

export interface EquipmentEventItem {
  id: string
  equipmentId: string
  eventType: string
  sourceStatus: string
  targetStatus: string
  reason: string
  note?: string | null
  operatorId?: string | null
  operatorName: string
  occurredAt: string
  durationSeconds?: number | null
  endedAt?: string | null
}

export interface WorkCenterConfig {
  id: string
  code: string
  name: string
  category?: string | null
  note?: string | null
  isActive: boolean
  deletedAt?: string | null
  _count: { equipment: number }
  sortOrder: number
}

export interface WorkCenterForm {
  code: string
  name: string
  category: string
  note: string
  isActive: boolean
}
