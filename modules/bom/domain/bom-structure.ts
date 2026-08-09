export interface BomStructureInput {
  purpose: 'PRODUCTION' | 'PACKAGING'
  outputs: Array<{ materialId: string; isPrimary?: boolean }>
  inputMaterialIds: string[]
  allowEmptyOutputs?: boolean
}

export function validateBomStructure(input: BomStructureInput) {
  if (new Set(input.inputMaterialIds).size !== input.inputMaterialIds.length) return '同一投入物料不能重复添加'
  if (input.outputs.length === 0) return input.allowEmptyOutputs ? null : 'BOM 产出物料不存在或已归档'
  if (input.outputs.filter((output) => output.isPrimary).length !== 1) return 'BOM 必须且只能设置一项主产出'
  if (new Set(input.outputs.map((output) => output.materialId)).size !== input.outputs.length) return '同一产出物料不能重复添加'
  if (input.purpose === 'PACKAGING' && input.outputs.length !== 1) return '包装 BOM 必须且只能设置一项产出'
  if (input.inputMaterialIds.some((materialId) => input.outputs.some((output) => output.materialId === materialId))) {
    return 'BOM 投入与产出不能使用同一物料；同物料跨库位请使用流程转移'
  }
  return null
}
