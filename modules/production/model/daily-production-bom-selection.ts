import type {
  DailyProductionBomOption,
  DailyProductionMaterialOption,
} from '../contracts/daily-production-shortcut'

export interface DailyProductionBomCandidate {
  bom: DailyProductionBomOption
  outputMaterial: DailyProductionBomOption['outputs'][number]['material']
  matchedOutputMaterial: DailyProductionBomOption['outputs'][number]['material']
}

export interface DailyProductionBomFilters {
  outputMaterialId?: string
  inputMaterialId?: string
}

function uniqueBomCandidates(materials: DailyProductionMaterialOption[]) {
  const byBomId = new Map<string, DailyProductionBomCandidate>()
  for (const fallbackOutputMaterial of materials) {
    for (const bom of fallbackOutputMaterial.boms) {
      if (byBomId.has(bom.id)) continue
      const outputMaterial = bom.outputs.find((output) => output.isPrimary)?.material || fallbackOutputMaterial
      byBomId.set(bom.id, { bom, outputMaterial, matchedOutputMaterial: outputMaterial })
    }
  }
  return Array.from(byBomId.values())
}

export function dailyProductionInputMaterials(materials: DailyProductionMaterialOption[]) {
  const byId = new Map<string, NonNullable<DailyProductionBomOption['items'][number]['material']>>()
  for (const outputMaterial of materials) {
    for (const bom of outputMaterial.boms) {
      for (const item of bom.items) {
        if (item.material && !byId.has(item.material.id)) byId.set(item.material.id, item.material)
      }
    }
  }
  return Array.from(byId.values()).sort((left, right) => left.code.localeCompare(right.code, 'zh-CN', { numeric: true }))
}

export function dailyProductionOutputMaterials(materials: DailyProductionMaterialOption[]) {
  const byId = new Map<string, DailyProductionBomOption['outputs'][number]['material']>()
  for (const candidate of uniqueBomCandidates(materials)) {
    if (candidate.bom.outputs.length === 0) byId.set(candidate.outputMaterial.id, candidate.outputMaterial)
    for (const output of candidate.bom.outputs) {
      if (!byId.has(output.material.id)) byId.set(output.material.id, output.material)
    }
  }
  return Array.from(byId.values()).sort((left, right) => left.code.localeCompare(right.code, 'zh-CN', { numeric: true }))
}

export function dailyProductionBomCandidates(
  materials: DailyProductionMaterialOption[],
  filters: DailyProductionBomFilters = {},
): DailyProductionBomCandidate[] {
  return uniqueBomCandidates(materials)
    .filter(({ bom, outputMaterial }) => (
      !filters.outputMaterialId
      || bom.outputs.some((output) => output.materialId === filters.outputMaterialId)
      || (bom.outputs.length === 0 && outputMaterial.id === filters.outputMaterialId)
    ))
    .filter(({ bom }) => !filters.inputMaterialId || bom.items.some((item) => item.material?.id === filters.inputMaterialId))
    .map((candidate) => ({
      ...candidate,
      matchedOutputMaterial: candidate.bom.outputs.find((output) => output.materialId === filters.outputMaterialId)?.material
        || candidate.outputMaterial,
    }))
    .sort((left, right) => (
      Number(right.bom.isDefault) - Number(left.bom.isDefault)
      || left.outputMaterial.code.localeCompare(right.outputMaterial.code, 'zh-CN', { numeric: true })
      || left.bom.name.localeCompare(right.bom.name, 'zh-CN')
      || left.bom.version.localeCompare(right.bom.version, 'zh-CN', { numeric: true })
    ))
}
