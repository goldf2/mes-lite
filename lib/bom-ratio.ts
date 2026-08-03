export type BomRatioInputMode = 'STANDARD_USAGE' | 'DIRECT_RATIO'

const roundRatio = (value: number) => Number(value.toFixed(6))

export function bomRatiosDiffer(savedRatio: number, nextRatio: number) {
  return roundRatio(Number(savedRatio)) !== roundRatio(Number(nextRatio))
}

export function bomInputToBaseUnit(value: number, toBaseFactor: number) {
  return Number(value) * Number(toBaseFactor)
}

export function baseUnitToBomInput(value: number, toBaseFactor: number) {
  return Number(value) / Number(toBaseFactor)
}

function positive(value: number, label: string) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${label}必须大于 0`)
  }
  return normalized
}

export function calculateBomUnitRatio(input: {
  mode: BomRatioInputMode
  standardUsage?: number
  outputQuantity?: number
  rawMaterialQuantity?: number
  inputToStockUnitRate?: number
}) {
  const inputToStockUnitRate = positive(Number(input.inputToStockUnitRate ?? 1), '录入单位换算率')
  if (input.mode === 'DIRECT_RATIO') {
    const outputQuantity = positive(Number(input.outputQuantity), '产出总量')
    const rawMaterialQuantity = positive(Number(input.rawMaterialQuantity), '投入总量')
    return roundRatio((rawMaterialQuantity * inputToStockUnitRate) / outputQuantity)
  }

  const standardUsage = positive(Number(input.standardUsage), '标准用量')
  return roundRatio(standardUsage * inputToStockUnitRate)
}
