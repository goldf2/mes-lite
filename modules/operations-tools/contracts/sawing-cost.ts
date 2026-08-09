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
