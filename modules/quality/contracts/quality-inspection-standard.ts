export interface QualityInspectionStandardItemView {
  id: string
  name: string
  method: string
  acceptanceCriteria: string
  sortOrder: number
}

export interface QualityInspectionMaterialOption {
  id: string
  code: string
  name: string
  stockUnit: string
}

export interface QualityInspectionStandardView {
  id: string
  code: string
  version: number
  name: string
  materialId: string
  sourceType: 'PRODUCTION_ORDER_ACTUAL_OUTPUT' | 'RETURN_ORDER'
  samplingMode: 'FULL' | 'FIXED' | 'PERCENTAGE'
  sampleValue: number
  minSampleQty: number | null
  maxSampleQty: number | null
  status: 'DRAFT' | 'RELEASED' | 'OBSOLETE'
  changeReason: string
  createdBy: string
  releasedAt: string | null
  releasedBy: string | null
  obsoleteAt: string | null
  obsoleteBy: string | null
  createdAt: string
  updatedAt: string
  material: QualityInspectionMaterialOption & { deletedAt?: string | null }
  items: QualityInspectionStandardItemView[]
}

export interface QualityInspectionStandardWorkspace {
  standards: QualityInspectionStandardView[]
  materials: QualityInspectionMaterialOption[]
}

export interface QualityTrendWorkspace {
  range: { startDate: string; endDate: string; truncated: boolean }
  summary: {
    completedInspections: number
    passedInspections: number
    failedInspections: number
    partialInspections: number
    sampleQty: number
    goodQty: number
    badQty: number
    inspectionPassRate: number
    samplePassRate: number
  }
  byDay: Array<{
    date: string
    completedInspections: number
    passedInspections: number
    failedInspections: number
    partialInspections: number
    sampleQty: number
    goodQty: number
    badQty: number
    samplePassRate: number
  }>
  byMaterial: Array<{
    materialId: string
    code: string
    name: string
    completedInspections: number
    passedInspections: number
    failedInspections: number
    partialInspections: number
    sampleQty: number
    goodQty: number
    badQty: number
    samplePassRate: number
  }>
  failedItems: Array<{ name: string; count: number }>
}
