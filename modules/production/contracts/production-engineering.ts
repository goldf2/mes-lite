export interface MaterialChoice {
  id: string
  sku: string
  name: string
  category: string
  customerId?: string | null
  customer?: { id: string; code: string; name: string } | null
  unit: string
  createdAt?: string
}

export interface ProcessStepForm {
  stepNo: number
  name: string
  defaultTime: number
  workstation: string
  workCenterId: string
  description: string
  templateId: string
  templateCode: string
  standardBatchQty: number
  setupTimeMinutes: number
  cycleTimeSeconds: number
  peopleCount: number
  laborRatePerHour: number
  machineCount: number
  machineRatePerHour: number
  energyCostPerHour: number
  consumableCostPerBatch: number
  yieldRate: number
}

export interface ProcessRoute {
  id: string
  productId: string
  name: string
  isDefault: boolean
  sortOrder: number
  product: { id: string; sku: string; name: string }
  steps: Array<ProcessStepForm & { id: string; defaultTime?: number | null; workstation?: string | null; workCenterId?: string | null; description?: string | null; templateId?: string | null; templateCode?: string | null }>
}

export interface ProcessWorkCenterOption {
  id: string
  code: string
  name: string
}

export interface ProcessTemplate {
  id: string
  code: string
  name: string
  category: string
  defaultTime?: number | null
  workstation?: string | null
  description?: string | null
  standardBatchQty: number
  setupTimeMinutes: number
  cycleTimeSeconds: number
  peopleCount: number
  laborRatePerHour: number
  machineCount: number
  machineRatePerHour: number
  energyCostPerHour: number
  consumableCostPerBatch: number
  yieldRate: number
  isPreset: boolean
  sortOrder: number
  materials: Array<{ id: string; code: string; name: string }>
}

export interface ProcessTemplateForm {
  code: string
  name: string
  category: string
  defaultTime: number
  workstation: string
  description: string
  materialIds: string[]
  standardBatchQty: number
  setupTimeMinutes: number
  cycleTimeSeconds: number
  peopleCount: number
  laborRatePerHour: number
  machineCount: number
  machineRatePerHour: number
  energyCostPerHour: number
  consumableCostPerBatch: number
  yieldRate: number
}

export interface ProcessRouteForm {
  productId: string
  name: string
  isDefault: boolean
  steps: ProcessStepForm[]
}
