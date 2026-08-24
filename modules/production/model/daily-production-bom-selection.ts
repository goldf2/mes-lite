import type {
  DailyProductionBomOption,
  DailyProductionMaterialOption,
} from '../contracts/daily-production-shortcut'

export interface DailyProductionBomCandidate {
  bom: DailyProductionBomOption
  outputMaterial: DailyProductionMaterialOption
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

export function dailyProductionBomCandidates(
  materials: DailyProductionMaterialOption[],
  inputMaterialId: string,
): DailyProductionBomCandidate[] {
  return materials.flatMap((outputMaterial) => outputMaterial.boms
    .filter((bom) => !inputMaterialId || bom.items.some((item) => item.material?.id === inputMaterialId))
    .map((bom) => ({ bom, outputMaterial })))
    .sort((left, right) => (
      Number(right.bom.isDefault) - Number(left.bom.isDefault)
      || left.outputMaterial.code.localeCompare(right.outputMaterial.code, 'zh-CN', { numeric: true })
      || left.bom.name.localeCompare(right.bom.name, 'zh-CN')
      || left.bom.version.localeCompare(right.bom.version, 'zh-CN', { numeric: true })
    ))
}
