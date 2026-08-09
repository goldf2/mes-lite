import type { BomCostLineInput, BomCostRunInput } from '../contracts/bom-cost'

interface CostedMaterial {
  id: string
  code: string
  name: string
  stockUnit: string
  unit: string
  valuationUnit?: string | null
  stock?: { stockUnitCost?: unknown; valuationUnitCost?: unknown } | null
}

interface BomCostItem {
  itemType: string
  quantity: unknown
  unit?: string | null
  wastageRate?: unknown
  outputMaterialId?: string | null
  material?: CostedMaterial | null
  sawingScenario?: {
    id: string
    name: string
    materialCostPerPiece?: unknown
    laborHoursPerPiece?: unknown
    machineHoursPerPiece?: unknown
  } | null
  costObject?: {
    id: string
    code: string
    name: string
    unit?: string | null
    objectType: string
    costs: Array<{
      materialCostPerUnit?: unknown
      laborHoursPerUnit?: unknown
      machineHoursPerUnit?: unknown
      directCostPerUnit?: unknown
    }>
  } | null
}

export class BomCostRuleError extends Error {}

export function roundBomCost(value: number) {
  return Number(value.toFixed(6))
}

export function materialUnitCost(item: BomCostItem) {
  const material = item.material
  if (!material) return 0
  const stockUnitCost = Number(material.stock?.stockUnitCost || 0)
  const valuationUnitCost = Number(material.stock?.valuationUnitCost || 0)
  if (item.unit && material.valuationUnit && item.unit === material.valuationUnit) {
    return valuationUnitCost || stockUnitCost
  }
  return stockUnitCost || valuationUnitCost
}

export function calculateBomCostSnapshot(input: BomCostRunInput & {
  items: BomCostItem[]
  outputQuantity: unknown
  primaryOutputMaterialId?: string | null
  productUnit?: string | null
}) {
  const costingItems = input.items.filter((item) => (
    item.itemType !== 'MATERIAL'
    || !item.outputMaterialId
    || item.outputMaterialId === input.primaryOutputMaterialId
  ))
  const outputBasis = Number(input.outputQuantity || 1)
  const missingMaterial = costingItems.find((item) => (
    item.itemType === 'MATERIAL' && item.material && Number(item.quantity) <= 0
  ))
  if (missingMaterial?.material) {
    throw new BomCostRuleError(`请先填写原料 ${missingMaterial.material.code} ${missingMaterial.material.name} 的 BOM 每批投入数量`)
  }

  const lines: BomCostLineInput[] = []
  costingItems.forEach((item, index) => {
    const baseQty = roundBomCost(
      Number(item.quantity || 0) * input.quantityBasis / outputBasis * (1 + Number(item.wastageRate || 0) / 100),
    )
    if (item.costObject) {
      const activeCost = item.costObject.costs[0]
      const materialCost = roundBomCost(baseQty * Number(activeCost?.materialCostPerUnit || 0))
      const laborHours = roundBomCost(baseQty * Number(activeCost?.laborHoursPerUnit || 0))
      const machineHours = roundBomCost(baseQty * Number(activeCost?.machineHoursPerUnit || 0))
      const laborCost = roundBomCost(laborHours * input.laborRatePerHour)
      const machineCost = roundBomCost(machineHours * input.machineRatePerHour)
      const directCost = roundBomCost(baseQty * Number(activeCost?.directCostPerUnit || 0))
      const totalCost = roundBomCost(materialCost + laborCost + machineCost + directCost)
      lines.push({
        lineType: 'BOM_COST_OBJECT', sourceId: item.costObject.id, code: item.costObject.code,
        name: item.costObject.name, quantity: baseQty, unit: item.unit || item.costObject.unit || '件',
        unitCost: baseQty > 0 ? roundBomCost(totalCost / baseQty) : 0,
        materialCost, laborHours, machineHours, laborCost, machineCost, directCost, totalCost,
        note: item.costObject.objectType === 'SAWING_COST' ? '锯切成本对象' : '成本对象', sortOrder: index,
      })
      return
    }
    if (item.itemType === 'SAWING_COST' && item.sawingScenario) {
      const scenario = item.sawingScenario
      const materialCost = roundBomCost(baseQty * Number(scenario.materialCostPerPiece || 0))
      const laborHours = roundBomCost(baseQty * Number(scenario.laborHoursPerPiece || 0))
      const machineHours = roundBomCost(baseQty * Number(scenario.machineHoursPerPiece || 0))
      const laborCost = roundBomCost(laborHours * input.laborRatePerHour)
      const machineCost = roundBomCost(machineHours * input.machineRatePerHour)
      const totalCost = roundBomCost(materialCost + laborCost + machineCost)
      lines.push({
        lineType: 'BOM_COST_OBJECT', sourceId: scenario.id, code: null, name: scenario.name,
        quantity: baseQty, unit: item.unit || '件', unitCost: baseQty > 0 ? roundBomCost(totalCost / baseQty) : 0,
        materialCost, laborHours, machineHours, laborCost, machineCost, directCost: 0, totalCost,
        note: '锯切方案成本对象', sortOrder: index,
      })
      return
    }
    if (item.itemType !== 'MATERIAL' || !item.material) return
    const unitCost = materialUnitCost(item)
    const materialCost = roundBomCost(baseQty * unitCost)
    lines.push({
      lineType: 'BOM_MATERIAL', sourceId: item.material.id, code: item.material.code, name: item.material.name,
      quantity: baseQty, unit: item.unit || item.material.stockUnit || item.material.unit,
      unitCost: roundBomCost(unitCost), materialCost, laborHours: 0, machineHours: 0,
      laborCost: 0, machineCost: 0, directCost: 0, totalCost: materialCost,
      note: `按 BOM 每批投入 ${roundBomCost(Number(item.quantity || 0))} ${item.unit}，折合 ${roundBomCost(Number(item.quantity || 0) / outputBasis)} ${item.unit}/${input.productUnit}产出计算`,
      sortOrder: index,
    })
  })

  if (input.overheadCost > 0) {
    lines.push({
      lineType: 'OVERHEAD', sourceId: null, code: null, name: '固定费用分摊', quantity: input.quantityBasis,
      unit: input.productUnit || '批', unitCost: roundBomCost(input.overheadCost / input.quantityBasis),
      materialCost: 0, laborHours: 0, machineHours: 0, laborCost: 0, machineCost: 0, directCost: 0,
      totalCost: roundBomCost(input.overheadCost), note: '仅本次成本计算分摊，不写入 BOM', sortOrder: lines.length,
    })
  }

  const totalMaterialCost = roundBomCost(lines.reduce((sum, line) => sum + line.materialCost, 0))
  const totalLaborCost = roundBomCost(lines.reduce((sum, line) => sum + line.laborCost, 0))
  const totalMachineCost = roundBomCost(lines.reduce((sum, line) => sum + line.machineCost, 0))
  const totalDirectCost = roundBomCost(lines.reduce((sum, line) => sum + line.directCost, 0))
  const totalCost = roundBomCost(lines.reduce((sum, line) => sum + line.totalCost, 0))
  return {
    lines, totalMaterialCost, totalLaborCost, totalMachineCost, totalDirectCost, totalCost,
    unitCost: roundBomCost(totalCost / input.quantityBasis),
  }
}
