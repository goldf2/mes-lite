import { Prisma } from '@prisma/client'

export type ProfileStockActor = {
  id?: string | null
  name?: string | null
}

type ReceiptProfileLine = {
  id: string
  actualLengthMm: number
  quantity: number
  trackingMode: string
  totalWeightKg: number | null
  location: string | null
  note: string | null
}

type ReceiptForProfileStock = {
  id: string
  inboundNo: string
  materialId: string
  supplierId: string
  batchNo: string | null
  receivedBy: string | null
  profileLines: ReceiptProfileLine[]
}

const roundWeight = (value: number) => Number(value.toFixed(6))

function receiptEntityNo(inboundNo: string, lineIndex: number, itemIndex?: number) {
  const linePart = String(lineIndex + 1).padStart(3, '0')
  if (itemIndex === undefined) return `PF-${inboundNo}-${linePart}`
  return `PF-${inboundNo}-${linePart}-${String(itemIndex + 1).padStart(3, '0')}`
}

export async function createProfileEntitiesForReceipt(
  tx: Prisma.TransactionClient,
  receipt: ReceiptForProfileStock,
  actor: ProfileStockActor,
) {
  let createdCount = 0

  for (let lineIndex = 0; lineIndex < receipt.profileLines.length; lineIndex += 1) {
    const line = receipt.profileLines[lineIndex]
    const quantity = Number(line.quantity)
    const length = Number(line.actualLengthMm)
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('型材实测行数量必须为正整数')
    if (!Number.isFinite(length) || length <= 0) throw new Error('型材实测长度必须大于 0')

    const trackingMode = line.trackingMode === 'SINGLE' ? 'SINGLE' : 'BATCH'
    const entityCount = trackingMode === 'SINGLE' ? quantity : 1
    const quantityPerEntity = trackingMode === 'SINGLE' ? 1 : quantity
    const totalWeightKg = line.totalWeightKg === null ? null : Number(line.totalWeightKg)
    const unitWeightKg = totalWeightKg !== null ? roundWeight(totalWeightKg / quantity) : null

    for (let itemIndex = 0; itemIndex < entityCount; itemIndex += 1) {
      const entityNo = receiptEntityNo(
        receipt.inboundNo,
        lineIndex,
        trackingMode === 'SINGLE' ? itemIndex : undefined,
      )
      const entityWeight = trackingMode === 'SINGLE' ? unitWeightKg : totalWeightKg
      const entity = await tx.profileStockEntity.create({
        data: {
          entityNo,
          materialId: receipt.materialId,
          materialInId: receipt.id,
          receiptLineId: line.id,
          supplierId: receipt.supplierId,
          entityType: trackingMode,
          actualLengthMm: length,
          originalLengthMm: length,
          quantity: quantityPerEntity,
          availableQty: quantityPerEntity,
          totalWeightKg: entityWeight,
          unitWeightKg,
          batchNo: receipt.batchNo,
          location: line.location,
          status: 'AVAILABLE',
          sourceType: 'MATERIAL_IN',
          sourceId: receipt.id,
          receivedAt: new Date(),
          note: line.note,
        },
      })

      await tx.profileStockMovement.create({
        data: {
          entityId: entity.id,
          movementType: 'RECEIVE',
          quantityDelta: quantityPerEntity,
          beforeAvailableQty: 0,
          afterAvailableQty: quantityPerEntity,
          beforeStatus: null,
          afterStatus: 'AVAILABLE',
          lengthBeforeMm: null,
          lengthAfterMm: length,
          sourceType: 'MATERIAL_IN',
          sourceId: receipt.id,
          idempotencyKey: `PROFILE_RECEIPT:${receipt.id}:${line.id}:${itemIndex}`,
          operatorId: actor.id || null,
          operatorName: actor.name || receipt.receivedBy || null,
          note: `来料单 ${receipt.inboundNo} 实体入库`,
        },
      })
      createdCount += 1
    }
  }

  return createdCount
}

export async function reverseProfileEntitiesForReceipt(
  tx: Prisma.TransactionClient,
  input: {
    materialInId: string
    inboundNo: string
    reason: string
    actor: ProfileStockActor
  },
) {
  const entities = await tx.profileStockEntity.findMany({
    where: { materialInId: input.materialInId },
    include: {
      movements: { orderBy: { createdAt: 'asc' } },
      _count: { select: { childEntities: true } },
    },
  })

  for (const entity of entities) {
    const untouched =
      entity.status === 'AVAILABLE'
      && entity.availableQty === entity.quantity
      && entity.reservedQty === 0
      && entity.consumedQty === 0
      && entity.scrappedQty === 0
      && entity.splitQty === 0
      && entity._count.childEntities === 0
      && entity.movements.length === 1
      && entity.movements[0]?.movementType === 'RECEIVE'

    if (!untouched) {
      throw new Error(`实体 ${entity.entityNo} 已拆分、占用或耗用，不能直接红冲来料单`)
    }
  }

  for (const entity of entities) {
    const sourceMovement = entity.movements[0]
    const reversal = await tx.profileStockMovement.create({
      data: {
        entityId: entity.id,
        movementType: 'REVERSE_RECEIPT',
        quantityDelta: -entity.quantity,
        beforeAvailableQty: entity.availableQty,
        afterAvailableQty: 0,
        beforeStatus: entity.status,
        afterStatus: 'REVERSED',
        lengthBeforeMm: entity.actualLengthMm,
        lengthAfterMm: entity.actualLengthMm,
        sourceType: 'MATERIAL_IN_REVERSE',
        sourceId: input.materialInId,
        sourceMovementId: sourceMovement.id,
        idempotencyKey: `PROFILE_RECEIPT:${input.materialInId}:REVERSE:${entity.id}`,
        operatorId: input.actor.id || null,
        operatorName: input.actor.name || null,
        note: `红冲来料单 ${input.inboundNo}: ${input.reason}`,
      },
    })
    await tx.profileStockMovement.update({
      where: { id: sourceMovement.id },
      data: { reversalMovementId: reversal.id },
    })
    await tx.profileStockEntity.update({
      where: { id: entity.id },
      data: {
        availableQty: 0,
        status: 'REVERSED',
        reversedAt: new Date(),
      },
    })
  }

  return entities.length
}

export async function splitProfileBatchEntity(
  tx: Prisma.TransactionClient,
  input: {
    entityId: string
    quantity: number
    clientRequestId: string
    actor: ProfileStockActor
  },
) {
  const existingMovement = await tx.profileStockMovement.findUnique({
    where: { idempotencyKey: `PROFILE_SPLIT:${input.clientRequestId}:PARENT` },
  })
  if (existingMovement) {
    return tx.profileStockEntity.findMany({
      where: { sourceType: 'PROFILE_ENTITY_SPLIT', sourceId: input.clientRequestId },
      orderBy: { entityNo: 'asc' },
    })
  }

  const entity = await tx.profileStockEntity.findUnique({
    where: { id: input.entityId },
    include: { _count: { select: { childEntities: true } } },
  })
  if (!entity) throw new Error('型材实体不存在')
  if (entity.entityType !== 'BATCH') throw new Error('只有同长批次实体可以拆分为单根')
  if (entity.status !== 'AVAILABLE') throw new Error('只有可用状态的同长批次可以拆分')
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('拆分数量必须为正整数')
  if (input.quantity > entity.availableQty) throw new Error('拆分数量不能超过批次可用数量')

  const afterAvailableQty = entity.availableQty - input.quantity
  const afterStatus = afterAvailableQty === 0 ? 'SPLIT' : 'AVAILABLE'
  const parentMovement = await tx.profileStockMovement.create({
    data: {
      entityId: entity.id,
      movementType: 'SPLIT_OUT',
      quantityDelta: -input.quantity,
      beforeAvailableQty: entity.availableQty,
      afterAvailableQty,
      beforeStatus: entity.status,
      afterStatus,
      lengthBeforeMm: entity.actualLengthMm,
      lengthAfterMm: entity.actualLengthMm,
      sourceType: 'PROFILE_ENTITY_SPLIT',
      sourceId: input.clientRequestId,
      idempotencyKey: `PROFILE_SPLIT:${input.clientRequestId}:PARENT`,
      operatorId: input.actor.id || null,
      operatorName: input.actor.name || null,
      note: `同长批次拆分 ${input.quantity} 根`,
    },
  })

  await tx.profileStockEntity.update({
    where: { id: entity.id },
    data: {
      availableQty: afterAvailableQty,
      splitQty: { increment: input.quantity },
      status: afterStatus,
    },
  })

  const children = []
  for (let index = 0; index < input.quantity; index += 1) {
    const childSequence = entity._count.childEntities + index + 1
    const child = await tx.profileStockEntity.create({
      data: {
        entityNo: `${entity.entityNo}-S${String(childSequence).padStart(3, '0')}`,
        materialId: entity.materialId,
        materialInId: entity.materialInId,
        receiptLineId: entity.receiptLineId,
        supplierId: entity.supplierId,
        parentEntityId: entity.id,
        entityType: 'SINGLE',
        actualLengthMm: entity.actualLengthMm,
        originalLengthMm: entity.originalLengthMm,
        quantity: 1,
        availableQty: 1,
        totalWeightKg: entity.unitWeightKg,
        unitWeightKg: entity.unitWeightKg,
        batchNo: entity.batchNo,
        location: entity.location,
        status: 'AVAILABLE',
        sourceType: 'PROFILE_ENTITY_SPLIT',
        sourceId: input.clientRequestId,
        receivedAt: entity.receivedAt,
        note: `由 ${entity.entityNo} 拆分`,
      },
    })
    await tx.profileStockMovement.create({
      data: {
        entityId: child.id,
        movementType: 'SPLIT_IN',
        quantityDelta: 1,
        beforeAvailableQty: 0,
        afterAvailableQty: 1,
        beforeStatus: null,
        afterStatus: 'AVAILABLE',
        lengthBeforeMm: null,
        lengthAfterMm: child.actualLengthMm,
        sourceType: 'PROFILE_ENTITY_SPLIT',
        sourceId: input.clientRequestId,
        sourceMovementId: parentMovement.id,
        idempotencyKey: `PROFILE_SPLIT:${input.clientRequestId}:CHILD:${index}`,
        operatorId: input.actor.id || null,
        operatorName: input.actor.name || null,
        note: `由 ${entity.entityNo} 拆分为单根`,
      },
    })
    children.push(child)
  }

  return children
}
