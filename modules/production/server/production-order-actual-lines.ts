import type { Prisma } from '@prisma/client'
import { calculateProductionConsumption, type ProductionLossMode } from '@/lib/production-consumption'
import { assertInventoryIssueAvailability, resolveInventoryLocation } from '@/lib/inventory'
import { parseProductionOrderBomSnapshot } from '../domain/production-order-bom-snapshot'

const roundQty = (value: number) => Number(value.toFixed(6))

type RequestedInput = {
  materialId: string
  locationId: string
  lossMode: ProductionLossMode
  lossValue: number
  actualQty?: number
}

type RequestedOutput = { materialId: string; locationId: string; actualQty: number }

export async function buildProductionOrderActualLines(
  tx: Prisma.TransactionClient,
  context: { bomSnapshotValue?: string | null; targetMaterialId: string },
  requestedInputs: RequestedInput[],
  requestedOutputs: RequestedOutput[],
) {
  const snapshot = context.bomSnapshotValue ? parseProductionOrderBomSnapshot(context.bomSnapshotValue) : null
  const requestedOutputByMaterial = new Map(requestedOutputs.map((output) => [output.materialId, output]))
  const requestedInputByMaterial = new Map(requestedInputs.map((input) => [input.materialId, input]))
  if (requestedOutputByMaterial.size !== requestedOutputs.length) throw new Error('同一产出物料不能重复填写')
  if (requestedInputByMaterial.size !== requestedInputs.length) throw new Error('同一投入物料不能重复填写')

  const requestedPrimary = requestedOutputByMaterial.get(context.targetMaterialId)
  if (!requestedPrimary || requestedPrimary.actualQty <= 0) throw new Error('生产订单目标产出实际数量必须大于 0')
  const presetPrimary = snapshot?.outputs.find((output) => output.isPrimary && output.materialId === context.targetMaterialId) || null
  if (snapshot && !presetPrimary) throw new Error('订单 BOM 主产出与生产订单目标不一致')
  const primaryBasis = Number(presetPrimary?.quantity || snapshot?.outputQuantity || 1)
  if (primaryBasis <= 0) throw new Error('订单 BOM 的主产出基准数量无效')
  const batchFactor = requestedPrimary.actualQty / primaryBasis

  const requestedMaterialIds = Array.from(new Set([
    ...requestedInputs.map((line) => line.materialId),
    ...requestedOutputs.map((line) => line.materialId),
  ]))
  const materials = await tx.material.findMany({
    where: { id: { in: requestedMaterialIds }, deletedAt: null },
    select: { id: true, code: true, name: true, stockUnit: true, unit: true },
  })
  const materialById = new Map(materials.map((material) => [material.id, material]))
  if (materials.length !== requestedMaterialIds.length) throw new Error('投入或产出明细中存在不存在或已归档的物料')

  const presetOutputByMaterial = new Map((snapshot?.outputs || []).map((output) => [output.materialId, output]))
  const outputs = []
  for (const requested of requestedOutputs) {
    if (!Number.isFinite(requested.actualQty) || requested.actualQty < 0) throw new Error('产出数量不能小于 0')
    const material = materialById.get(requested.materialId)!
    const preset = presetOutputByMaterial.get(requested.materialId)
    const location = await resolveInventoryLocation(tx, requested.locationId)
    outputs.push({
      materialId: material.id,
      locationId: location.id,
      bomOutputId: preset?.id || null,
      materialCode: material.code,
      materialName: material.name,
      quantityPerBatch: Number(preset?.quantity || 0),
      plannedQty: preset ? roundQty(Number(preset.quantity) * batchFactor) : 0,
      actualQty: roundQty(requested.actualQty),
      unit: preset?.unit || material.stockUnit || material.unit,
      isPrimary: material.id === context.targetMaterialId,
    })
  }

  const inputRelationsByMaterial = new Map<string, NonNullable<typeof snapshot>['items']>()
  for (const item of snapshot?.items || []) {
    const relations = inputRelationsByMaterial.get(item.materialId) || []
    relations.push(item)
    inputRelationsByMaterial.set(item.materialId, relations)
  }

  const inputs = []
  for (const requested of requestedInputs) {
    const material = materialById.get(requested.materialId)!
    const relations = inputRelationsByMaterial.get(requested.materialId) || []
    const location = await resolveInventoryLocation(tx, requested.locationId)
    if (relations.length === 0) {
      if (!Number.isFinite(requested.actualQty) || Number(requested.actualQty) <= 0) {
        throw new Error(`临时投入 ${material.code} ${material.name} 必须填写大于 0 的实际数量`)
      }
      const actualQty = roundQty(Number(requested.actualQty))
      await assertInventoryIssueAvailability(tx, { materialId: material.id, stockQty: actualQty, locationId: location.id })
      inputs.push({
        materialId: material.id,
        locationId: location.id,
        bomItemId: null,
        materialCode: material.code,
        materialName: material.name,
        quantityPerBatch: 0,
        lossMode: requested.lossMode,
        lossValue: requested.lossValue,
        lossQty: 0,
        plannedQty: 0,
        actualQty,
        unit: material.stockUnit || material.unit,
      })
      continue
    }

    const sharedBatchInputs = relations.filter((relation) => !relation.outputMaterialId)
    let plannedBaseQty = sharedBatchInputs.length > 0
      ? sharedBatchInputs.reduce((sum, relation) => sum + Number(relation.quantity), 0) * batchFactor
      : 0
    if (sharedBatchInputs.length === 0) {
      for (const relation of relations) {
        const targetOutput = snapshot?.outputs.find((output) => output.materialId === relation.outputMaterialId)
        if (!targetOutput || Number(targetOutput.quantity) <= 0) {
          throw new Error(`投入 ${material.code} 的历史产出换算关系无效，请重新保存 BOM`)
        }
        const requestedTargetOutput = requestedOutputByMaterial.get(targetOutput.materialId)
        plannedBaseQty += Number(requestedTargetOutput?.actualQty || 0) * Number(relation.quantity) / Number(targetOutput.quantity)
      }
    }
    plannedBaseQty = roundQty(plannedBaseQty)
    const calculated = calculateProductionConsumption({
      outputQty: requestedPrimary.actualQty,
      unitConsumption: plannedBaseQty / requestedPrimary.actualQty,
      lossMode: requested.lossMode,
      lossValue: requested.lossValue,
      actualQty: requested.actualQty,
    })
    await assertInventoryIssueAvailability(tx, { materialId: material.id, stockQty: calculated.actualQty, locationId: location.id })
    inputs.push({
      materialId: material.id,
      locationId: location.id,
      bomItemId: relations[0].id,
      materialCode: material.code,
      materialName: material.name,
      quantityPerBatch: roundQty(relations.reduce((sum, relation) => sum + Number(relation.quantity), 0)),
      lossMode: requested.lossMode,
      lossValue: requested.lossValue,
      lossQty: calculated.lossQty,
      plannedQty: calculated.plannedQty,
      actualQty: calculated.actualQty,
      unit: relations[0].unit || material.stockUnit || material.unit,
    })
  }

  const requestedInputIds = new Set(requestedInputs.map((line) => line.materialId))
  const requestedOutputIds = new Set(requestedOutputs.map((line) => line.materialId))
  const hasBomDeviation = requestedInputs.some((line) => !inputRelationsByMaterial.has(line.materialId))
    || requestedOutputs.some((line) => !presetOutputByMaterial.has(line.materialId))
    || Array.from(inputRelationsByMaterial.keys()).some((materialId) => !requestedInputIds.has(materialId))
    || Array.from(presetOutputByMaterial.keys()).some((materialId) => !requestedOutputIds.has(materialId))
  return { snapshot, primaryOutput: presetPrimary, batchFactor, inputs, outputs, hasBomDeviation }
}
