import { bomRatiosDiffer } from '@/lib/bom-ratio'
import { normalizeBomEntryQuantity } from '@/lib/bom-entry-units'
import { normalizeUnitCode } from '@/lib/unit-catalog'
import type {
  BomItem,
  BomMaterialOption,
  BomOutput,
  BomUnitCatalogItem,
  BomVersion,
  DraftBomItem,
  DraftBomOutput,
} from '../contracts'

function quantityInStockUnit(
  quantity: number | string,
  entryUnit: string,
  material: BomMaterialOption | undefined | null,
  unitCatalog: BomUnitCatalogItem[],
) {
  if (!material) return Number.NaN
  try {
    return normalizeBomEntryQuantity({
      quantity: Number(quantity),
      entryUnit,
      material,
      catalog: unitCatalog,
    }).quantity
  } catch {
    return Number.NaN
  }
}

export function isBomDraftDirty(input: {
  selectedBomId: string
  selectedBom: BomVersion | null
  selectedMaterial: BomMaterialOption | null
  savedBatchItems: BomItem[]
  savedAdditionalOutputs: BomOutput[]
  draftItems: DraftBomItem[]
  draftOutputs: DraftBomOutput[]
  draftName: string
  draftPurpose: 'PRODUCTION' | 'PACKAGING'
  draftIsDefault: boolean
  primaryOutputQuantity: number
  primaryOutputUnit: string
  materialById: Map<string, BomMaterialOption>
  unitCatalog: BomUnitCatalogItem[]
}) {
  const savedItemByMaterialId = new Map(
    input.savedBatchItems.map((item) => [item.material?.id || '', item]),
  )
  const savedOutputByMaterialId = new Map(
    input.savedAdditionalOutputs.map((output) => [output.material.id, output]),
  )
  const primaryOutput = input.selectedBom?.outputs.find((output) => output.isPrimary)

  return input.draftItems.length !== input.savedBatchItems.length
    || input.draftItems.some((item) => {
      const savedItem = savedItemByMaterialId.get(item.materialId)
      const material = input.materialById.get(item.materialId)
      return !savedItem
        || bomRatiosDiffer(
          Number(savedItem.quantity),
          quantityInStockUnit(item.quantity, item.unit, material, input.unitCatalog),
        )
        || normalizeUnitCode(savedItem.entryUnit || savedItem.unit) !== normalizeUnitCode(item.unit)
    })
    || input.draftOutputs.length !== input.savedAdditionalOutputs.length
    || input.draftOutputs.some((output) => {
      const savedOutput = savedOutputByMaterialId.get(output.materialId)
      const material = input.materialById.get(output.materialId)
      return !savedOutput
        || bomRatiosDiffer(
          Number(savedOutput.quantity),
          quantityInStockUnit(output.quantity, output.unit, material, input.unitCatalog),
        )
        || normalizeUnitCode(savedOutput.entryUnit || savedOutput.unit) !== normalizeUnitCode(output.unit)
    })
    || input.selectedBomId === '__new__'
    || input.draftName !== (input.selectedBom?.name || '')
    || input.draftPurpose !== (input.selectedBom?.purpose || 'PRODUCTION')
    || input.draftIsDefault !== (input.selectedBom?.isDefault ?? true)
    || bomRatiosDiffer(
      quantityInStockUnit(input.primaryOutputQuantity, input.primaryOutputUnit, input.selectedMaterial, input.unitCatalog),
      Number(input.selectedBom?.outputQuantity || 1),
    )
    || normalizeUnitCode(primaryOutput?.entryUnit || primaryOutput?.unit || input.selectedBom?.outputUnit || '')
      !== normalizeUnitCode(input.primaryOutputUnit)
}
