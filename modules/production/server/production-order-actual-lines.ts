import type { Prisma } from '@prisma/client'
import { calculateProductionConsumption, type ProductionLossMode } from '@/lib/production-consumption'
import { assertInventoryIssueAvailability, resolveInventoryLocation } from '@/lib/inventory'
import { parseProductionOrderBomSnapshot } from '../domain/production-order-bom-snapshot'

const roundQty = (value: number) => Number(value.toFixed(6))

export async function buildProductionOrderActualLines(
  tx: Prisma.TransactionClient,
  bomSnapshotValue: string,
  requestedInputs: Array<{
    materialId: string
    locationId: string
    lossMode: ProductionLossMode
    lossValue: number
    actualQty?: number
  }>,
  requestedOutputs: Array<{ materialId: string; locationId: string; actualQty: number }>,
) {
  const snapshot = parseProductionOrderBomSnapshot(bomSnapshotValue)
  const primaryOutput = snapshot.outputs.find((output) => output.isPrimary)!
  const requestedOutputByMaterial = new Map(requestedOutputs.map((output) => [output.materialId, output]))
  const requestedInputByMaterial = new Map(requestedInputs.map((input) => [input.materialId, input]))
  if (requestedOutputByMaterial.size !== requestedOutputs.length) throw new Error('同一产出物料不能重复填写')
  if (requestedInputByMaterial.size !== requestedInputs.length) throw new Error('同一投入物料不能重复填写')
  if (requestedOutputs.some((output) => !snapshot.outputs.some((item) => item.materialId === output.materialId))) {
    throw new Error('产出明细中存在不属于订单 BOM 的物料')
  }
  if (requestedInputs.some((input) => !snapshot.items.some((item) => item.materialId === input.materialId))) {
    throw new Error('投入明细中存在不属于订单 BOM 的物料')
  }

  const requestedPrimary = requestedOutputByMaterial.get(primaryOutput.materialId)
  if (!requestedPrimary || requestedPrimary.actualQty <= 0) throw new Error('主产出实际数量必须大于 0')
  const primaryBasis = Number(primaryOutput.quantity || snapshot.outputQuantity || 1)
  if (primaryBasis <= 0) throw new Error('订单 BOM 的主产出基准数量无效')
  const batchFactor = requestedPrimary.actualQty / primaryBasis

  const outputs = []
  for (const output of snapshot.outputs) {
    const requested = requestedOutputByMaterial.get(output.materialId)
    if (!requested) throw new Error(`请填写产出 ${output.material.code} ${output.material.name} 的数量和入库库位`)
    if (!Number.isFinite(requested.actualQty) || requested.actualQty < 0) throw new Error('产出数量不能小于 0')
    const location = await resolveInventoryLocation(tx, requested.locationId)
    outputs.push({
      materialId: output.materialId,
      locationId: location.id,
      bomOutputId: output.id,
      materialCode: output.material.code,
      materialName: output.material.name,
      quantityPerBatch: Number(output.quantity),
      plannedQty: roundQty(Number(output.quantity) * batchFactor),
      actualQty: roundQty(requested.actualQty),
      unit: output.unit || output.material.stockUnit || output.material.unit,
      isPrimary: output.isPrimary,
    })
  }

  const inputRelationsByMaterial = new Map<string, typeof snapshot.items>()
  for (const item of snapshot.items) {
    const relations = inputRelationsByMaterial.get(item.materialId) || []
    relations.push(item)
    inputRelationsByMaterial.set(item.materialId, relations)
  }

  const inputs = []
  for (const [materialId, relations] of Array.from(inputRelationsByMaterial.entries())) {
    const representative = relations[0]
    const requested = requestedInputByMaterial.get(materialId)
    if (!requested) throw new Error(`请填写投入 ${representative.material.code} ${representative.material.name} 的来源库位和计划外额外耗用`)
    const location = await resolveInventoryLocation(tx, requested.locationId)
    const sharedBatchInputs = relations.filter((relation) => !relation.outputMaterialId)
    let plannedBaseQty = sharedBatchInputs.length > 0
      ? sharedBatchInputs.reduce((sum, relation) => sum + Number(relation.quantity), 0) * batchFactor
      : 0
    if (sharedBatchInputs.length === 0) {
      for (const relation of relations) {
        const targetOutput = snapshot.outputs.find((output) => output.materialId === relation.outputMaterialId)
        if (!targetOutput || Number(targetOutput.quantity) <= 0) {
          throw new Error(`投入 ${representative.material.code} 的历史产出换算关系无效，请重新保存 BOM`)
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
    await assertInventoryIssueAvailability(tx, { materialId, stockQty: calculated.actualQty, locationId: location.id })
    inputs.push({
      materialId,
      locationId: location.id,
      bomItemId: relations.length === 1 ? representative.id : null,
      materialCode: representative.material.code,
      materialName: representative.material.name,
      quantityPerBatch: roundQty(relations.reduce((sum, relation) => sum + Number(relation.quantity), 0)),
      lossMode: requested.lossMode,
      lossValue: requested.lossValue,
      lossQty: calculated.lossQty,
      plannedQty: calculated.plannedQty,
      actualQty: calculated.actualQty,
      unit: representative.unit || representative.material.stockUnit || representative.material.unit,
    })
  }

  return { snapshot, primaryOutput, batchFactor, inputs, outputs }
}
