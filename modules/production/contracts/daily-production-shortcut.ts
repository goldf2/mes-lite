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
  costRuns: DailyProductionCostRunOption[]
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

export interface DailyProductionCostRunOption {
  id: string
  processRouteId?: string | null
  processRouteName?: string | null
  /** 带工艺路线的成本运行必须有冻结快照，才能用于新日报。 */
  hasProcessRouteSnapshot: boolean
  unitCost: number
  totalCost: number
  quantityBasis: number
  createdAt: string
}

export interface DailyProductionMaterialOption {
  id: string
  code: string
  name: string
  spec?: string | null
  stockUnit: string
  unit: string
  inventory: {
    availableQty: number
    restricted: boolean
    locationBalances: Array<{ locationId: string; qty: number; availableQty: number }>
  }
  boms: DailyProductionBomOption[]
}

export interface DailyProductionReportSummary {
  id: string
  reportNo: string
  reportDate: string
  outputQty: number
  status: string
  note?: string | null
  bomName?: string | null
  bomVersion?: string | null
  processRouteName?: string | null
  bomCostSnapshot?: { unitCost: number; totalCost: number; totalMaterialCost: number; totalLaborCost: number; totalMachineCost: number } | null
  confirmedAt?: string | null
  confirmedBy?: string | null
  reversedAt?: string | null
  reversedBy?: string | null
  reverseReason?: string | null
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
