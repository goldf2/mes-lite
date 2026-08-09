import type {
  SaveSawingScenarioInput,
  SavedSawingScenario,
  SawingMaterialForm,
  SawingMaterialResult,
  SawingMixRow,
  SawingProductOption,
  SawingScaleForm,
  SawingScaleResult,
  SawingShiftForm,
  SawingShiftResult,
} from '../contracts/sawing-cost'

export const defaultSawingMaterialForm = (): SawingMaterialForm => ({
  materialLength: 6000,
  materialWeight: 48,
  workpieceLength: 250,
  bladeThickness: 2.5,
  rawMaterialPrice: 6.8,
  sawdustPrice: 0.8,
  scrapPrice: 3.2,
  finishedPrice: 18,
})

export const defaultSawingShiftForm = (): SawingShiftForm => ({
  workerCount: 2,
  shiftHours: 8,
  laborRatePerHour: 28,
  piecesPerLaborHour: 10,
  machineCount: 1,
  machineRatePerHour: 35,
})

export const defaultSawingScaleForm = (): SawingScaleForm => ({
  plannedShifts: 20,
  machineHoursPerShift: 8,
  otherCost: 0,
})

export function calculateSawingMaterial(form: SawingMaterialForm): SawingMaterialResult {
  const { materialLength, materialWeight, workpieceLength, bladeThickness, rawMaterialPrice, sawdustPrice, scrapPrice, finishedPrice } = form
  const valid = materialLength > 0 && materialWeight > 0 && workpieceLength > 0 && workpieceLength + bladeThickness > 0
  const quantity = valid ? Math.floor((materialLength + bladeThickness) / (workpieceLength + bladeThickness)) : 0
  const productLength = quantity * workpieceLength
  const kerfLength = quantity * bladeThickness
  const remainderLength = Math.max(0, materialLength - productLength - kerfLength)
  const weightPerLength = valid ? materialWeight / materialLength : 0
  const productWeight = productLength * weightPerLength
  const sawdustWeight = kerfLength * weightPerLength
  const scrapWeight = remainderLength * weightPerLength
  const rawCost = materialWeight * rawMaterialPrice
  const sawdustRecovery = sawdustWeight * sawdustPrice
  const scrapRecovery = scrapWeight * scrapPrice
  const netMaterialCost = Math.max(0, rawCost - sawdustRecovery - scrapRecovery)
  const materialCostPerPiece = quantity > 0 ? netMaterialCost / quantity : 0
  const totalRevenue = quantity * finishedPrice
  const totalProfit = totalRevenue - netMaterialCost
  const grossMargin = totalRevenue > 0 ? totalProfit / totalRevenue * 100 : 0
  const utilization = materialWeight > 0 ? productWeight / materialWeight * 100 : 0
  const profitPerPiece = finishedPrice - materialCostPerPiece
  return { quantity, productLength, kerfLength, remainderLength, productWeight, sawdustWeight, scrapWeight, rawCost, sawdustRecovery, scrapRecovery, netMaterialCost, materialCostPerPiece, profitPerPiece, totalRevenue, totalProfit, grossMargin, utilization }
}

export function calculateSawingShift(form: SawingMaterialForm, material: SawingMaterialResult, shift: SawingShiftForm): SawingShiftResult {
  const laborHours = shift.workerCount * shift.shiftHours
  const quantity = laborHours * shift.piecesPerLaborHour
  const revenue = quantity * form.finishedPrice
  const materialCost = quantity * material.materialCostPerPiece
  const laborCost = laborHours * shift.laborRatePerHour
  const machineHours = shift.machineCount * shift.shiftHours
  const machineCost = machineHours * shift.machineRatePerHour
  const totalCost = materialCost + laborCost + machineCost
  const profit = revenue - totalCost
  const margin = revenue > 0 ? profit / revenue * 100 : 0
  return { laborHours, quantity, revenue, materialCost, laborCost, machineHours, machineCost, totalCost, profit, margin }
}

export function calculateSawingScale(rows: SawingMixRow[], scale: SawingScaleForm, shift: SawingShiftForm): SawingScaleResult {
  const totalRevenue = rows.reduce((sum, row) => sum + row.quantity * row.sellingPrice, 0)
  const materialCost = rows.reduce((sum, row) => sum + row.quantity * row.materialCostPerPiece, 0)
  const laborHours = rows.reduce((sum, row) => sum + row.quantity * row.laborHoursPerPiece, 0)
  const machineHours = rows.reduce((sum, row) => sum + row.quantity * row.machineHoursPerPiece, 0)
  const laborCost = laborHours * shift.laborRatePerHour
  const machineCost = machineHours * shift.machineRatePerHour
  const totalCost = materialCost + laborCost + machineCost + scale.otherCost
  const profit = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? profit / totalRevenue * 100 : 0
  const laborCapacity = shift.workerCount * shift.shiftHours * scale.plannedShifts
  const machineCapacity = shift.machineCount * scale.machineHoursPerShift * scale.plannedShifts
  const laborLoad = laborCapacity > 0 ? laborHours / laborCapacity * 100 : 0
  const machineLoad = machineCapacity > 0 ? machineHours / machineCapacity * 100 : 0
  const laborPerShift = shift.workerCount * shift.shiftHours
  const machinePerShift = shift.machineCount * scale.machineHoursPerShift
  const requiredShifts = Math.max(laborPerShift > 0 ? laborHours / laborPerShift : 0, machinePerShift > 0 ? machineHours / machinePerShift : 0)
  return { totalRevenue, materialCost, laborHours, machineHours, laborCost, machineCost, totalCost, profit, margin, laborCapacity, machineCapacity, laborLoad, machineLoad, requiredShifts }
}

export function mergeSawingProductOptions(...groups: SawingProductOption[][]) {
  const map = new Map<string, SawingProductOption>()
  groups.flat().forEach((item) => map.set(item.id, item))
  return Array.from(map.values())
}

export function createCurrentSawingMixRow(
  form: SawingMaterialForm,
  material: SawingMaterialResult,
  shift: SawingShiftForm,
  shiftResult: SawingShiftResult,
  plannedShifts: number,
): SawingMixRow {
  return {
    id: `mix-${Date.now()}`,
    name: '当前锯切物料',
    quantity: Math.max(0, Math.round(shiftResult.quantity * plannedShifts)),
    sellingPrice: form.finishedPrice,
    materialCostPerPiece: material.materialCostPerPiece,
    laborHoursPerPiece: shift.piecesPerLaborHour > 0 ? 1 / shift.piecesPerLaborHour : 0,
    machineHoursPerPiece: shiftResult.quantity > 0 ? shiftResult.machineHours / shiftResult.quantity : 0,
  }
}

export function createScenarioMixRow(scenario: SavedSawingScenario): SawingMixRow {
  return {
    id: `mix-scenario-${scenario.id}-${Date.now()}`,
    name: scenario.product ? `${scenario.product.sku} ${scenario.product.name}` : scenario.name,
    quantity: Math.max(0, scenario.quantity),
    sellingPrice: scenario.finishedPrice,
    materialCostPerPiece: scenario.materialCostPerPiece,
    laborHoursPerPiece: scenario.laborHoursPerPiece,
    machineHoursPerPiece: scenario.machineHoursPerPiece,
  }
}

export function resolveSawingScenarioName(
  name: string,
  kind: 'TEMPORARY' | 'EXISTING',
  productId: string,
  products: SawingProductOption[],
  form: SawingMaterialForm,
  material: SawingMaterialResult,
) {
  if (name.trim()) return name.trim()
  const selected = products.find((product) => product.id === productId)
  if (kind === 'EXISTING' && selected) return `${selected.sku} ${selected.name} 锯切成本`
  return `临时锯切 ${form.workpieceLength}mm ${form.bladeThickness}mm缝 ${material.materialCostPerPiece.toFixed(2)}元/件`
}

export function buildSawingScenarioInput(args: {
  name: string
  productKind: 'TEMPORARY' | 'EXISTING'
  selectedProductId: string
  bomProductId: string
  selectedProcessIds: string[]
  form: SawingMaterialForm
  material: SawingMaterialResult
  shift: SawingShiftForm
  shiftResult: SawingShiftResult
  scale: SawingScaleForm
  scaleResult: SawingScaleResult
}): SaveSawingScenarioInput {
  const { name, productKind, selectedProductId, bomProductId, selectedProcessIds, form, material, shift, shiftResult, scale, scaleResult } = args
  return {
    ...form,
    ...material,
    name,
    productKind,
    productId: productKind === 'EXISTING' ? selectedProductId : undefined,
    bomProductId: bomProductId || undefined,
    laborHoursPerPiece: shift.piecesPerLaborHour > 0 ? 1 / shift.piecesPerLaborHour : 0,
    machineHoursPerPiece: shiftResult.quantity > 0 ? shiftResult.machineHours / shiftResult.quantity : 0,
    processTemplateIds: selectedProcessIds,
    additionalDirectCost: 0,
    laborCost: scaleResult.laborCost,
    fixedCost: scaleResult.machineCost + scale.otherCost,
    directStageCost: scaleResult.materialCost,
    manufacturingCost: scaleResult.materialCost + scaleResult.laborCost,
    fullCost: scaleResult.totalCost,
    directProfit: scaleResult.totalRevenue - scaleResult.materialCost,
    manufacturingProfit: scaleResult.totalRevenue - scaleResult.materialCost - scaleResult.laborCost,
    fullProfit: scaleResult.profit,
    directMargin: scaleResult.totalRevenue > 0 ? (scaleResult.totalRevenue - scaleResult.materialCost) / scaleResult.totalRevenue * 100 : 0,
    manufacturingMargin: scaleResult.totalRevenue > 0 ? (scaleResult.totalRevenue - scaleResult.materialCost - scaleResult.laborCost) / scaleResult.totalRevenue * 100 : 0,
    fullMargin: scaleResult.margin,
    costItems: [
      { stage: 'LABOR', name: '规模测算人工工时', method: 'LABOR_HOURS', inputA: 1, inputB: scaleResult.laborHours, inputC: shift.laborRatePerHour, amount: scaleResult.laborCost, isDeduction: false, sortOrder: 0 },
      { stage: 'FIXED', name: '规模测算机时费用', method: 'LABOR_HOURS', inputA: 1, inputB: scaleResult.machineHours, inputC: shift.machineRatePerHour, amount: scaleResult.machineCost, isDeduction: false, sortOrder: 1 },
      { stage: 'FIXED', name: '其他期间费用', method: 'MANUAL', inputA: scale.otherCost, inputB: 0, inputC: 0, amount: scale.otherCost, isDeduction: false, sortOrder: 2 },
    ],
  }
}

export const formatSawingMoney = (value: number) => `¥${value.toFixed(2)}`
export const formatSawingWeight = (value: number) => `${value.toFixed(3)} kg`
