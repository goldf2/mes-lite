export interface EquipmentMaintenanceEquipmentOption {
  id: string
  code: string
  name: string
  status: string
  workCenter: { id: string; code: string; name: string }
}

export interface EquipmentMaintenanceMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  stockUnit: string
  availableQty: number
  locationBalances: Array<{ locationId: string; availableQty: number; location: { id: string; code: string; name: string } }>
}

export interface EquipmentMaintenancePlan {
  id: string
  code: string
  name: string
  intervalDays: number
  status: string
  nextDueAt: string
  note?: string | null
  equipment: EquipmentMaintenanceEquipmentOption
  items: Array<{ id: string; name: string; standard: string; sortOrder: number }>
  workOrders: Array<{ id: string; workOrderNo: string; status: string; planDueAt?: string | null }>
}

export interface EquipmentMaintenanceWorkOrder {
  id: string
  workOrderNo: string
  kind: string
  title: string
  priority: string
  status: string
  dueAt?: string | null
  faultDescription?: string | null
  assignedTo?: string | null
  startedAt?: string | null
  completedAt?: string | null
  workDescription?: string | null
  failureCause?: string | null
  equipment: EquipmentMaintenanceEquipmentOption
  plan?: { id: string; code: string; name: string; items: Array<{ id: string; name: string; standard: string; sortOrder: number }> } | null
  results: Array<{ id: string; itemName: string; standard: string; result: string; note?: string | null; sortOrder: number }>
  spares: Array<{
    id: string
    stockQty: number
    costAmount: number
    stockUnitSnapshot: string
    material: { id: string; code: string; name: string }
    location: { id: string; code: string; name: string }
    lotAllocations: Array<{ id: string; stockQty: number; lot: { id: string; lotNo: string } }>
  }>
}

export interface EquipmentMaintenanceWorkspace {
  plans: EquipmentMaintenancePlan[]
  workOrders: EquipmentMaintenanceWorkOrder[]
  counts: { duePlans: number; overduePlans: number; openOrders: number; activeOrders: number; completedOrders: number }
  equipmentOptions: EquipmentMaintenanceEquipmentOption[]
  materialOptions: EquipmentMaintenanceMaterialOption[]
}
