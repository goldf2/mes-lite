import { z } from 'zod'

const nonnegativeNumber = z.number().finite().nonnegative()

export const saveSawingScenarioSchema = z.object({
  name: z.string().trim().max(100).optional(),
  materialLength: nonnegativeNumber.positive(), materialWeight: nonnegativeNumber.positive(), workpieceLength: nonnegativeNumber.positive(), bladeThickness: nonnegativeNumber,
  rawMaterialPrice: nonnegativeNumber, sawdustPrice: nonnegativeNumber, scrapPrice: nonnegativeNumber, finishedPrice: nonnegativeNumber,
  quantity: z.number().int().positive(), utilization: nonnegativeNumber, productWeight: nonnegativeNumber, sawdustWeight: nonnegativeNumber, scrapWeight: nonnegativeNumber,
  netMaterialCost: nonnegativeNumber, materialCostPerPiece: nonnegativeNumber, profitPerPiece: z.number().finite(), totalRevenue: nonnegativeNumber, totalProfit: z.number().finite(), grossMargin: z.number().finite(),
  additionalDirectCost: z.number().finite(), laborCost: nonnegativeNumber, fixedCost: nonnegativeNumber, directStageCost: z.number().finite(), manufacturingCost: z.number().finite(), fullCost: z.number().finite(),
  directProfit: z.number().finite(), manufacturingProfit: z.number().finite(), fullProfit: z.number().finite(), directMargin: z.number().finite(), manufacturingMargin: z.number().finite(), fullMargin: z.number().finite(),
  productKind: z.enum(['EXISTING', 'TEMPORARY']).default('TEMPORARY'),
  productId: z.string().optional(),
  bomProductId: z.string().optional(),
  laborHoursPerPiece: nonnegativeNumber,
  machineHoursPerPiece: nonnegativeNumber,
  processTemplateIds: z.array(z.string()).default([]),
  costItems: z.array(z.object({
    stage: z.enum(['DIRECT', 'LABOR', 'FIXED']), name: z.string().trim().min(1), method: z.string().min(1),
    inputA: nonnegativeNumber, inputB: nonnegativeNumber, inputC: nonnegativeNumber, amount: z.number().finite(),
    isDeduction: z.boolean(), note: z.string().optional(), sortOrder: z.number().int().nonnegative(),
  })).default([]),
})

export type ParsedSawingScenarioInput = z.infer<typeof saveSawingScenarioSchema>

export interface SawingProcessOption {
  id: string
  code: string
  name: string
  category: string
}

export interface SawingProductOption {
  id: string
  sku: string
  name: string
  unit: string
}

export interface SavedSawingScenario {
  id: string
  name: string
  quantity: number
  utilization: number
  materialCostPerPiece: number
  totalRevenue: number
  totalProfit: number
  grossMargin: number
  bladeThickness: number
  finishedPrice: number
  laborCost: number
  fullCost: number
  fullProfit: number
  fullMargin: number
  productKind: 'EXISTING' | 'TEMPORARY'
  laborHoursPerPiece: number
  machineHoursPerPiece: number
  product?: SawingProductOption | null
  bomItems?: Array<{ bom: { product: { id: string; sku: string; name: string } } }>
  processTemplates: SawingProcessOption[]
}

export interface SawingMaterialForm {
  materialLength: number
  materialWeight: number
  workpieceLength: number
  bladeThickness: number
  rawMaterialPrice: number
  sawdustPrice: number
  scrapPrice: number
  finishedPrice: number
}

export interface SawingShiftForm {
  workerCount: number
  shiftHours: number
  laborRatePerHour: number
  piecesPerLaborHour: number
  machineCount: number
  machineRatePerHour: number
}

export interface SawingScaleForm {
  plannedShifts: number
  machineHoursPerShift: number
  otherCost: number
}

export interface SawingMixRow {
  id: string
  name: string
  quantity: number
  sellingPrice: number
  materialCostPerPiece: number
  laborHoursPerPiece: number
  machineHoursPerPiece: number
}

export interface SawingMaterialResult {
  quantity: number
  productLength: number
  kerfLength: number
  remainderLength: number
  productWeight: number
  sawdustWeight: number
  scrapWeight: number
  rawCost: number
  sawdustRecovery: number
  scrapRecovery: number
  netMaterialCost: number
  materialCostPerPiece: number
  profitPerPiece: number
  totalRevenue: number
  totalProfit: number
  grossMargin: number
  utilization: number
}

export interface SawingShiftResult {
  laborHours: number
  quantity: number
  revenue: number
  materialCost: number
  laborCost: number
  machineHours: number
  machineCost: number
  totalCost: number
  profit: number
  margin: number
}

export interface SawingScaleResult {
  totalRevenue: number
  materialCost: number
  laborHours: number
  machineHours: number
  laborCost: number
  machineCost: number
  totalCost: number
  profit: number
  margin: number
  laborCapacity: number
  machineCapacity: number
  laborLoad: number
  machineLoad: number
  requiredShifts: number
}

export interface SawingCostItemInput {
  stage: 'DIRECT' | 'LABOR' | 'FIXED'
  name: string
  method: string
  inputA: number
  inputB: number
  inputC: number
  amount: number
  isDeduction: boolean
  sortOrder: number
}

export interface SaveSawingScenarioInput extends SawingMaterialForm, SawingMaterialResult {
  name: string
  productKind: 'EXISTING' | 'TEMPORARY'
  productId?: string
  bomProductId?: string
  laborHoursPerPiece: number
  machineHoursPerPiece: number
  processTemplateIds: string[]
  additionalDirectCost: number
  laborCost: number
  fixedCost: number
  directStageCost: number
  manufacturingCost: number
  fullCost: number
  directProfit: number
  manufacturingProfit: number
  fullProfit: number
  directMargin: number
  manufacturingMargin: number
  fullMargin: number
  costItems: SawingCostItemInput[]
}

export interface SawingCostWorkspace {
  scenarios: SavedSawingScenario[]
  processOptions: SawingProcessOption[]
  productOptions: SawingProductOption[]
}
