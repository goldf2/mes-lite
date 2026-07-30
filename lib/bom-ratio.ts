export type BomRatioInputMode = 'USAGE_LOSS' | 'DIRECT_RATIO'
export type BomLossInputMode = 'PERCENT' | 'FIXED'
export type BomLengthInputUnit = 'mm' | 'cm' | 'm'

const roundRatio = (value: number) => Number(value.toFixed(6))
const lengthUnitToMeter: Record<BomLengthInputUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
}

export function bomLengthInputToMeters(value: number, unit: BomLengthInputUnit) {
  return Number(value) * lengthUnitToMeter[unit]
}

export function metersToBomLengthInput(value: number, unit: BomLengthInputUnit) {
  return Number(value) / lengthUnitToMeter[unit]
}

function positive(value: number, label: string) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${label}必须大于 0`)
  }
  return normalized
}

function nonnegative(value: number, label: string) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label}不能小于 0`)
  }
  return normalized
}

export function calculateBomUnitRatio(input: {
  mode: BomRatioInputMode
  standardUsage?: number
  lossMode?: BomLossInputMode
  lossValue?: number
  outputQuantity?: number
  rawMaterialQuantity?: number
  inputToStockUnitRate?: number
}) {
  const inputToStockUnitRate = positive(Number(input.inputToStockUnitRate ?? 1), '录入单位换算率')
  if (input.mode === 'DIRECT_RATIO') {
    const outputQuantity = positive(Number(input.outputQuantity), '成品数量')
    const rawMaterialQuantity = positive(Number(input.rawMaterialQuantity), '原料数量')
    return roundRatio((rawMaterialQuantity * inputToStockUnitRate) / outputQuantity)
  }

  const standardUsage = positive(Number(input.standardUsage), '标准用量')
  const lossValue = nonnegative(Number(input.lossValue || 0), '损耗')
  const totalUsage = input.lossMode === 'FIXED'
    ? standardUsage + lossValue
    : standardUsage * (1 + lossValue / 100)
  return roundRatio(totalUsage * inputToStockUnitRate)
}
