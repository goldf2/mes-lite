import { z } from 'zod'

const nonnegativeNumber = z.number().finite().nonnegative()

export const bomCostRunInputSchema = z.object({
  productId: z.string().min(1, '请选择物料'),
  bomId: z.string().min(1).optional(),
  processRouteId: z.string().optional(),
  quantityBasis: nonnegativeNumber.positive().default(1),
  laborRatePerHour: nonnegativeNumber.default(0),
  machineRatePerHour: nonnegativeNumber.default(0),
  overheadCost: nonnegativeNumber.default(0),
})

export type BomCostRunInput = z.infer<typeof bomCostRunInputSchema>

export interface BomCostBomOption {
  id: string
  name?: string
  version: string
  isActive: boolean
  isDefault?: boolean
  outputQuantity: number
  outputUnit?: string
  items: Array<{
    id: string
    itemType?: string
    quantity: number
    unit: string
    outputMaterialId?: string | null
    material: { id: string; code: string; name: string; stockUnit: string; unit: string } | null
  }>
}

export interface BomCostLineInput {
  lineType: string
  sourceId: string | null
  code: string | null
  name: string
  quantity: number
  unit: string
  unitCost: number
  materialCost: number
  laborHours: number
  machineHours: number
  laborCost: number
  machineCost: number
  directCost: number
  totalCost: number
  note: string | null
  sortOrder: number
}

export interface BomCostProductOption {
  id: string
  sku: string
  name: string
  unit: string
  bom?: BomCostBomOption | null
  boms: BomCostBomOption[]
  processRoutes: BomCostProcessRoute[]
}

export interface BomCostLine extends Omit<BomCostLineInput, 'sortOrder' | 'sourceId' | 'code' | 'note'> {
  id: string
  sourceId?: string | null
  code?: string | null
  note?: string | null
}

export interface BomCostRun {
  id: string
  productId: string
  bomId?: string | null
  bomVersion?: string | null
  processRouteId?: string | null
  processRouteName?: string | null
  processRouteSnapshot?: string | null
  quantityBasis: number
  laborRatePerHour: number
  machineRatePerHour: number
  overheadCost: number
  totalMaterialCost: number
  totalLaborCost: number
  totalMachineCost: number
  totalDirectCost: number
  totalCost: number
  unitCost: number
  createdBy?: string | null
  createdAt: string
  product?: { id: string; sku: string; name: string; unit: string }
  lines: BomCostLine[]
}

export interface BomCostObject {
  id: string
  code: string
  name: string
  objectType: string
  sourceType?: string | null
  unit: string
  status: string
  createdAt: string
  costs: Array<{
    id: string
    version: string
    materialCostPerUnit: number
    laborHoursPerUnit: number
    machineHoursPerUnit: number
    directCostPerUnit: number
    effectiveFrom: string
  }>
  bomItems: Array<{
    id: string
    quantity: number
    unit: string
    bom: { id: string; version: string; product: { id: string; sku: string; name: string; unit: string } }
  }>
}

export interface BomCostProcessTemplate {
  id: string
  code: string
  name: string
  category: string
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
  materials: Array<{ id: string; code: string; name: string }>
}

export interface BomCostProcessStep {
  id: string
  stepNo: number
  name: string
  templateCode?: string | null
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
  workCenter?: { id: string; code: string; name: string; laborRatePerHour?: number | null; machineRatePerHour?: number | null; energyCostPerHour?: number | null } | null
}

export interface BomCostProcessRoute {
  id: string
  name: string
  isDefault: boolean
  steps: BomCostProcessStep[]
}

export interface BomCostDataProduct {
  id: string
  sku: string
  name: string
  unit: string
  bom?: {
    id: string
    version: string
    isActive: boolean
    items: Array<{
      id: string
      itemType: string
      quantity: number
      unit: string
      wastageRate: number
      material?: { id: string; code: string; name: string; stockUnit: string; valuationUnit: string } | null
      costObject?: { id: string; code: string; name: string; objectType: string; unit: string } | null
      sawingScenario?: { id: string; name: string } | null
    }>
  } | null
  boms?: BomCostBomOption[]
  processRoutes: Array<{
    id: string
    name: string
    isDefault: boolean
    steps: BomCostProcessStep[]
  }>
  bomCostRuns: Array<{ id: string; unitCost: number; totalCost: number; quantityBasis: number; createdAt: string }>
}

export interface BomCostData {
  costObjects: BomCostObject[]
  processTemplates: BomCostProcessTemplate[]
  products: BomCostDataProduct[]
  recentRuns: BomCostRun[]
}

export interface BomCostObjectInput {
  code: string
  name: string
  objectType: string
  unit: string
  materialCostPerUnit: number
  laborHoursPerUnit: number
  machineHoursPerUnit: number
  directCostPerUnit: number
}
