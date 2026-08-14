export type QualitySamplingRule = {
  mode: 'FULL' | 'FIXED' | 'PERCENTAGE'
  value: number
  min: number | null
  max: number | null
}

const precision = 1_000_000

export function calculateSuggestedSampleQty(inspectedQty: number, rule: QualitySamplingRule) {
  if (!Number.isFinite(inspectedQty) || inspectedQty <= 0) return 0
  let suggested = inspectedQty
  if (rule.mode === 'FIXED') suggested = rule.value
  if (rule.mode === 'PERCENTAGE') suggested = inspectedQty * rule.value / 100
  if (rule.min != null) suggested = Math.max(suggested, rule.min)
  if (rule.max != null) suggested = Math.min(suggested, rule.max)
  return Math.round(Math.min(inspectedQty, Math.max(0, suggested)) * precision) / precision
}
