export interface EquipmentInspectionPlanItem {
  id: string
  name: string
  standard: string
  unit?: string | null
  sortOrder: number
}

export interface EquipmentInspectionPlan {
  id: string
  code: string
  name: string
  intervalDays: number
  status: string
  nextDueAt: string
  activatedAt: string
  note?: string | null
  equipment: { id: string; code: string; name: string; status: string; workCenter: { id: string; code: string; name: string } }
  items: EquipmentInspectionPlanItem[]
  records: EquipmentInspectionRecord[]
}

export interface EquipmentInspectionRecord {
  id: string
  recordNo: string
  dueAt: string
  inspectedAt: string
  result: string
  inspectorName: string
  note?: string | null
  faultEventId?: string | null
  items: Array<EquipmentInspectionPlanItem & { actualValue?: string | null; result: string; note?: string | null }>
}

export interface EquipmentInspectionEquipmentOption {
  id: string
  code: string
  name: string
  status: string
  workCenter: { id: string; code: string; name: string }
}

export interface EquipmentInspectionWorkspace {
  plans: EquipmentInspectionPlan[]
  counts: { due: number; overdue: number; abnormal: number }
  equipmentOptions: EquipmentInspectionEquipmentOption[]
}
