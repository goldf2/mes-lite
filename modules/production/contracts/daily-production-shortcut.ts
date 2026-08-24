export interface DailyProductionBomItem {
  id: string
  outputMaterialId?: string | null
  quantity: number
  unit: string
  wastageRate: number
  material: {
    id: string
    code: string
    name: string
    spec?: string | null
    stockUnit: string
    unit: string
  } | null
}

export interface DailyProductionBomOption {
  id: string
  name: string
  version: string
  isDefault: boolean
  isActive: boolean
  outputQuantity: number
  outputUnit: string
  items: DailyProductionBomItem[]
  outputs: Array<{
    id: string
    materialId: string
    quantity: number
    unit: string
    isPrimary: boolean
    material: { id: string; code: string; name: string; spec?: string | null; stockUnit: string; unit: string }
  }>
}

export interface DailyProductionMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  stockUnit: string
  unit: string
  boms: DailyProductionBomOption[]
}

export interface DailyProductionReportSummary {
  id: string
  reportNo: string
  reportDate: string
  outputQty: number
  status: string
  bomName?: string | null
  bomVersion?: string | null
  outputLocation?: { code: string; name: string } | null
  finishedMaterial: { code: string; name: string; stockUnit: string; unit: string }
  consumptions: Array<{ id: string; materialCode: string; materialName: string; actualQty: number; unit: string }>
  outputs: Array<{
    id: string
    materialCode: string
    materialName: string
    actualQty: number
    unit: string
    isPrimary: boolean
    location: { code: string; name: string }
  }>
  qualityInspection?: { id: string; inspectionNo: string; status: string; result: string } | null
}
