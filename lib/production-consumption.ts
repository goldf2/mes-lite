export type ProductionLossMode = 'FIXED_PER_UNIT' | 'PERCENT'

const roundQty = (value: number) => Number(value.toFixed(6))

export function calculateProductionConsumption(input: {
  outputQty: number
  unitConsumption: number
  lossMode: ProductionLossMode
  lossValue: number
  actualQty?: number | null
}) {
  const outputQty = Number(input.outputQty)
  const unitConsumption = Number(input.unitConsumption)
  const lossValue = Number(input.lossValue)
  if (!Number.isFinite(outputQty) || outputQty <= 0) throw new Error('总加工数量必须大于 0')
  if (!Number.isFinite(unitConsumption) || unitConsumption <= 0) throw new Error('BOM 换算比例必须大于 0')
  if (!Number.isFinite(lossValue) || lossValue < 0) throw new Error('损耗不能小于 0')

  const baseQty = roundQty(outputQty * unitConsumption)
  const lossQty = roundQty(input.lossMode === 'FIXED_PER_UNIT'
    ? outputQty * lossValue
    : baseQty * lossValue / 100)
  const plannedQty = roundQty(baseQty + lossQty)
  const actualQty = input.actualQty === undefined || input.actualQty === null
    ? plannedQty
    : roundQty(Number(input.actualQty))
  if (!Number.isFinite(actualQty) || actualQty <= 0) throw new Error('实际耗用量必须大于 0')

  return {
    baseQty,
    lossQty,
    plannedQty,
    actualQty,
  }
}
