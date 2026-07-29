import { Prisma } from '@prisma/client'
import { consumeMaterialCost } from './costing'
import { postInventoryReceipt } from './inventory'
import { normalizeConversionRate } from './units'

const tolerance = 0.000001
const roundQty = (value: number) => Number(value.toFixed(6))

type Actor = {
  id?: string | null
  name?: string | null
}

async function loadMaterialStock(tx: Prisma.TransactionClient, materialId: string) {
  const material = await tx.material.findFirst({
    where: { id: materialId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      stockUnit: true,
      valuationUnit: true,
      conversionRate: true,
      costingMethod: true,
      stock: true,
    },
  })
  if (!material) throw new Error('型材物料不存在或已归档')
  if (!material.stock) throw new Error(`型材 ${material.code} ${material.name} 没有库存总账`)
  return { material, stock: material.stock }
}

function valuationForReservation(stockQty: number, stock: { qty: number; valuationQty: number }, conversionRate: number) {
  const rate = Number(stock.qty) > tolerance
    ? Number(stock.valuationQty) / Number(stock.qty)
    : normalizeConversionRate(conversionRate)
  return roundQty(stockQty * rate)
}

export async function reserveCuttingInventory(
  tx: Prisma.TransactionClient,
  input: {
    planId: string
    planNo: string
    materialId: string
    stockQty: number
    actor: Actor
  },
) {
  const idempotencyKey = `CUTTING_PLAN:${input.planId}:STOCK_RESERVE`
  const existing = await tx.stockLog.findUnique({ where: { idempotencyKey } })
  if (existing) {
    return {
      movement: existing,
      stockQty: Number(existing.afterReservedQty || 0) - Number(existing.beforeReservedQty || 0),
      valuationQty: Number(existing.afterReservedValuationQty || 0) - Number(existing.beforeReservedValuationQty || 0),
      duplicate: true,
    }
  }

  if (!Number.isInteger(input.stockQty) || input.stockQty <= 0) throw new Error('排样预留根数必须为正整数')
  const { material, stock } = await loadMaterialStock(tx, input.materialId)
  const stockQty = roundQty(input.stockQty)
  if (Number(stock.availableQty) + tolerance < stockQty) {
    throw new Error(`型材 ${material.code} ${material.name} 汇总可用库存不足：可用 ${stock.availableQty} ${material.stockUnit || material.unit}，需 ${stockQty}`)
  }
  const valuationQty = valuationForReservation(stockQty, stock, Number(material.conversionRate))
  if (Number(stock.availableValuationQty) + tolerance < valuationQty) {
    throw new Error(`型材 ${material.code} ${material.name} 可用核算库存不足，不能确认排样`)
  }

  const beforeReservedQty = Number(stock.reservedQty)
  const beforeAvailableQty = Number(stock.availableQty)
  const beforeReservedValuationQty = Number(stock.reservedValuationQty)
  const beforeAvailableValuationQty = Number(stock.availableValuationQty)
  const afterReservedQty = roundQty(beforeReservedQty + stockQty)
  const afterAvailableQty = roundQty(beforeAvailableQty - stockQty)
  const afterReservedValuationQty = roundQty(beforeReservedValuationQty + valuationQty)
  const afterAvailableValuationQty = roundQty(beforeAvailableValuationQty - valuationQty)

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      reservedQty: afterReservedQty,
      availableQty: afterAvailableQty,
      reservedValuationQty: afterReservedValuationQty,
      availableValuationQty: afterAvailableValuationQty,
    },
  })
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      type: 'CUTTING_RESERVE',
      qty: 0,
      beforeQty: Number(stock.qty),
      afterQty: Number(stock.qty),
      valuationQty: 0,
      beforeValuationQty: Number(stock.valuationQty),
      afterValuationQty: Number(stock.valuationQty),
      costAmount: 0,
      beforeCostAmount: Number(stock.totalCost),
      afterCostAmount: Number(stock.totalCost),
      stockUnitSnapshot: material.stockUnit || material.unit,
      valuationUnitSnapshot: material.valuationUnit || material.unit,
      conversionRateUsed: stockQty > 0 ? roundQty(valuationQty / stockQty) : 0,
      conversionSource: 'STOCK_AVERAGE',
      costingMethodSnapshot: material.costingMethod,
      beforeReservedQty,
      afterReservedQty,
      beforeAvailableQty,
      afterAvailableQty,
      beforeReservedValuationQty,
      afterReservedValuationQty,
      beforeAvailableValuationQty,
      afterAvailableValuationQty,
      idempotencyKey,
      refType: 'CUTTING_PLAN',
      refId: input.planId,
      note: `排样方案 ${input.planNo} 预留 ${stockQty} 根型材`,
      createdBy: input.actor.name || null,
    },
  })
  return { movement, stockQty, valuationQty, duplicate: false }
}

export async function releaseCuttingInventoryReservation(
  tx: Prisma.TransactionClient,
  input: {
    planId: string
    planNo: string
    materialId: string
    stockQty: number
    valuationQty: number
    sourceMovementId?: string | null
    reason: string
    actor: Actor
  },
) {
  const idempotencyKey = `CUTTING_PLAN:${input.planId}:STOCK_RELEASE`
  const existing = await tx.stockLog.findUnique({ where: { idempotencyKey } })
  if (existing) return { movement: existing, duplicate: true }

  const { material, stock } = await loadMaterialStock(tx, input.materialId)
  const stockQty = roundQty(input.stockQty)
  const valuationQty = roundQty(input.valuationQty)
  if (Number(stock.reservedQty) + tolerance < stockQty || Number(stock.reservedValuationQty) + tolerance < valuationQty) {
    throw new Error(`排样方案 ${input.planNo} 的汇总库存预留不足，不能取消`)
  }

  const beforeReservedQty = Number(stock.reservedQty)
  const beforeAvailableQty = Number(stock.availableQty)
  const beforeReservedValuationQty = Number(stock.reservedValuationQty)
  const beforeAvailableValuationQty = Number(stock.availableValuationQty)
  const afterReservedQty = roundQty(beforeReservedQty - stockQty)
  const afterAvailableQty = roundQty(beforeAvailableQty + stockQty)
  const afterReservedValuationQty = roundQty(beforeReservedValuationQty - valuationQty)
  const afterAvailableValuationQty = roundQty(beforeAvailableValuationQty + valuationQty)

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      reservedQty: afterReservedQty,
      availableQty: afterAvailableQty,
      reservedValuationQty: afterReservedValuationQty,
      availableValuationQty: afterAvailableValuationQty,
    },
  })
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      type: 'CUTTING_RESERVATION_RELEASE',
      qty: 0,
      beforeQty: Number(stock.qty),
      afterQty: Number(stock.qty),
      valuationQty: 0,
      beforeValuationQty: Number(stock.valuationQty),
      afterValuationQty: Number(stock.valuationQty),
      costAmount: 0,
      beforeCostAmount: Number(stock.totalCost),
      afterCostAmount: Number(stock.totalCost),
      stockUnitSnapshot: material.stockUnit || material.unit,
      valuationUnitSnapshot: material.valuationUnit || material.unit,
      conversionRateUsed: stockQty > 0 ? roundQty(valuationQty / stockQty) : 0,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costingMethodSnapshot: material.costingMethod,
      beforeReservedQty,
      afterReservedQty,
      beforeAvailableQty,
      afterAvailableQty,
      beforeReservedValuationQty,
      afterReservedValuationQty,
      beforeAvailableValuationQty,
      afterAvailableValuationQty,
      sourceMovementId: input.sourceMovementId || null,
      idempotencyKey,
      refType: 'CUTTING_PLAN_CANCEL',
      refId: input.planId,
      note: `取消排样方案 ${input.planNo}，释放 ${stockQty} 根型材：${input.reason}`,
      createdBy: input.actor.name || null,
    },
  })
  if (input.sourceMovementId) {
    await tx.stockLog.update({
      where: { id: input.sourceMovementId },
      data: { reversalMovementId: movement.id },
    })
  }
  return { movement, duplicate: false }
}

export async function issueReservedCuttingInventory(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    taskNo: string
    materialId: string
    stockQty: number
    reservedValuationQty: number
    actor: Actor
  },
) {
  const idempotencyKey = `CUTTING_TASK:${input.taskId}:STOCK_ISSUE`
  const existing = await tx.stockLog.findUnique({ where: { idempotencyKey } })
  if (existing) {
    const task = await tx.cuttingTask.findUniqueOrThrow({ where: { id: input.taskId } })
    return {
      movement: existing,
      stockQty: Number(task.issueStockQty),
      valuationQty: Number(task.issueValuationQty),
      costAmount: Number(task.issueCostAmount),
      conversionRateUsed: Number(task.issueConversionRate || 0),
      conversionSource: task.issueConversionSource || 'STOCK_AVERAGE',
      costingMethod: task.issueCostingMethod || '',
      duplicate: true,
    }
  }

  const { material, stock } = await loadMaterialStock(tx, input.materialId)
  const stockQty = roundQty(input.stockQty)
  const reservedValuationQty = roundQty(input.reservedValuationQty)
  if (Number(stock.reservedQty) + tolerance < stockQty) {
    throw new Error(`锯切任务 ${input.taskNo} 的汇总库存预留不足`)
  }
  if (Number(stock.reservedValuationQty) + tolerance < reservedValuationQty) {
    throw new Error(`锯切任务 ${input.taskNo} 的汇总核算库存预留不足`)
  }

  const costResult = await consumeMaterialCost(tx, {
    materialId: material.id,
    issueStockQty: stockQty,
    stock: {
      id: stock.id,
      qty: Number(stock.qty),
      valuationQty: Number(stock.valuationQty),
      totalCost: Number(stock.totalCost),
      valuationUnitCost: Number(stock.valuationUnitCost),
    },
    material: {
      costingMethod: material.costingMethod,
      conversionRate: Number(material.conversionRate),
    },
  })
  if (costResult.layerConsumptions.length > 0) {
    await tx.cuttingTaskCostLayerConsumption.createMany({
      data: costResult.layerConsumptions.map((layer) => ({
        taskId: input.taskId,
        costLayerId: layer.costLayerId,
        materialId: layer.materialId,
        stockQty: layer.stockQty,
        valuationQty: layer.valuationQty,
        costAmount: layer.costAmount,
        stockUnitCost: layer.stockUnitCost,
        valuationUnitCost: layer.valuationUnitCost,
      })),
    })
  }

  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const beforeReservedQty = Number(stock.reservedQty)
  const beforeAvailableQty = Number(stock.availableQty)
  const beforeReservedValuationQty = Number(stock.reservedValuationQty)
  const beforeAvailableValuationQty = Number(stock.availableValuationQty)
  const afterQty = roundQty(beforeQty - stockQty)
  const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - costResult.issueValuationQty))
  const afterCostAmount = Math.max(0, roundQty(beforeCostAmount - costResult.costAmount))
  const afterReservedQty = roundQty(beforeReservedQty - stockQty)
  const afterAvailableQty = beforeAvailableQty
  const afterReservedValuationQty = roundQty(beforeReservedValuationQty - reservedValuationQty)
  const afterAvailableValuationQty = Math.max(0, roundQty(afterValuationQty - afterReservedValuationQty))

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      reservedQty: afterReservedQty,
      availableQty: afterAvailableQty,
      valuationQty: afterValuationQty,
      reservedValuationQty: afterReservedValuationQty,
      availableValuationQty: afterAvailableValuationQty,
      totalCost: afterCostAmount,
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })
  const conversionSource = material.costingMethod === 'FIFO' ? 'FIFO_LAYER' : 'STOCK_AVERAGE'
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      type: 'CUTTING_ISSUE',
      qty: -stockQty,
      beforeQty,
      afterQty,
      valuationQty: -costResult.issueValuationQty,
      beforeValuationQty,
      afterValuationQty,
      costAmount: -costResult.costAmount,
      beforeCostAmount,
      afterCostAmount,
      stockUnitSnapshot: material.stockUnit || material.unit,
      valuationUnitSnapshot: material.valuationUnit || material.unit,
      conversionRateUsed: costResult.issueValuationQty > 0
        ? roundQty(costResult.issueValuationQty / stockQty)
        : 0,
      conversionSource,
      costingMethodSnapshot: material.costingMethod,
      beforeReservedQty,
      afterReservedQty,
      beforeAvailableQty,
      afterAvailableQty,
      beforeReservedValuationQty,
      afterReservedValuationQty,
      beforeAvailableValuationQty,
      afterAvailableValuationQty,
      idempotencyKey,
      refType: 'CUTTING_TASK',
      refId: input.taskId,
      note: `锯切任务 ${input.taskNo} 完工耗用 ${stockQty} 根型材`,
      createdBy: input.actor.name || null,
    },
  })
  return {
    movement,
    stockQty,
    valuationQty: costResult.issueValuationQty,
    costAmount: costResult.costAmount,
    conversionRateUsed: costResult.conversionRateUsed,
    conversionSource,
    costingMethod: material.costingMethod,
    duplicate: false,
  }
}

export async function reverseCuttingInventoryIssue(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    taskNo: string
    materialId: string
    stockQty: number
    valuationQty: number
    reservedValuationQty: number
    costAmount: number
    costingMethod?: string | null
    sourceMovementId?: string | null
    reason: string
    actor: Actor
  },
) {
  const idempotencyKey = `CUTTING_TASK:${input.taskId}:STOCK_REVERSE`
  const existing = await tx.stockLog.findUnique({ where: { idempotencyKey } })
  if (existing) return { movement: existing, duplicate: true }

  const { material, stock } = await loadMaterialStock(tx, input.materialId)
  if (input.costingMethod === 'FIFO') {
    const consumptions = await tx.cuttingTaskCostLayerConsumption.findMany({
      where: { taskId: input.taskId, restoredAt: null },
      orderBy: { createdAt: 'desc' },
    })
    if (consumptions.length === 0) throw new Error('FIFO 锯切冲销失败：缺少成本层消耗明细')
    for (const item of consumptions) {
      await tx.inventoryCostLayer.update({
        where: { id: item.costLayerId },
        data: {
          remainingStockQty: { increment: Number(item.stockQty) },
          remainingValuationQty: { increment: Number(item.valuationQty) },
          remainingAmount: { increment: Number(item.costAmount) },
          status: 'OPEN',
        },
      })
    }
    await tx.cuttingTaskCostLayerConsumption.updateMany({
      where: { taskId: input.taskId, restoredAt: null },
      data: { restoredAt: new Date() },
    })
  }

  const stockQty = roundQty(input.stockQty)
  const valuationQty = roundQty(input.valuationQty)
  const reservedValuationQty = roundQty(input.reservedValuationQty)
  const costAmount = roundQty(input.costAmount)
  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const beforeReservedQty = Number(stock.reservedQty)
  const beforeAvailableQty = Number(stock.availableQty)
  const beforeReservedValuationQty = Number(stock.reservedValuationQty)
  const beforeAvailableValuationQty = Number(stock.availableValuationQty)
  const afterQty = roundQty(beforeQty + stockQty)
  const afterValuationQty = roundQty(beforeValuationQty + valuationQty)
  const afterCostAmount = roundQty(beforeCostAmount + costAmount)
  const afterReservedQty = roundQty(beforeReservedQty + stockQty)
  const afterAvailableQty = beforeAvailableQty
  const afterReservedValuationQty = roundQty(beforeReservedValuationQty + reservedValuationQty)
  const afterAvailableValuationQty = Math.max(0, roundQty(afterValuationQty - afterReservedValuationQty))

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      reservedQty: afterReservedQty,
      availableQty: afterAvailableQty,
      valuationQty: afterValuationQty,
      reservedValuationQty: afterReservedValuationQty,
      availableValuationQty: afterAvailableValuationQty,
      totalCost: afterCostAmount,
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      type: 'CUTTING_ISSUE_REVERSAL',
      qty: stockQty,
      beforeQty,
      afterQty,
      valuationQty,
      beforeValuationQty,
      afterValuationQty,
      costAmount,
      beforeCostAmount,
      afterCostAmount,
      stockUnitSnapshot: material.stockUnit || material.unit,
      valuationUnitSnapshot: material.valuationUnit || material.unit,
      conversionRateUsed: stockQty > 0 ? roundQty(valuationQty / stockQty) : 0,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costingMethodSnapshot: input.costingMethod || material.costingMethod,
      beforeReservedQty,
      afterReservedQty,
      beforeAvailableQty,
      afterAvailableQty,
      beforeReservedValuationQty,
      afterReservedValuationQty,
      beforeAvailableValuationQty,
      afterAvailableValuationQty,
      sourceMovementId: input.sourceMovementId || null,
      idempotencyKey,
      refType: 'CUTTING_TASK_REVERSAL',
      refId: input.taskId,
      note: `冲销锯切任务 ${input.taskNo}：${input.reason}`,
      createdBy: input.actor.name || null,
    },
  })
  if (input.sourceMovementId) {
    await tx.stockLog.update({
      where: { id: input.sourceMovementId },
      data: { reversalMovementId: movement.id },
    })
  }
  return { movement, duplicate: false }
}

export async function receiveCuttingRemnant(
  tx: Prisma.TransactionClient,
  input: {
    taskSourceId: string
    taskNo: string
    materialId: string
    valuationQty: number
    costAmount: number
    actor: Actor
  },
) {
  return postInventoryReceipt(tx, {
    materialId: input.materialId,
    stockQty: 1,
    valuationQty: roundQty(input.valuationQty),
    conversionSource: 'DOCUMENT_ACTUAL',
    costAmount: roundQty(input.costAmount),
    type: 'CUTTING_REMNANT_IN',
    refType: 'CUTTING_TASK_REMNANT',
    refId: input.taskSourceId,
    note: `锯切任务 ${input.taskNo} 可复用余料回库`,
    createdBy: input.actor.name || null,
    idempotencyKey: `CUTTING_TASK_SOURCE:${input.taskSourceId}:REMNANT_IN`,
  })
}

export async function reverseCuttingRemnantReceipt(
  tx: Prisma.TransactionClient,
  input: {
    taskSourceId: string
    taskNo: string
    materialId: string
    sourceMovementId?: string | null
    reason: string
    actor: Actor
  },
) {
  const idempotencyKey = `CUTTING_TASK_SOURCE:${input.taskSourceId}:REMNANT_REVERSE`
  const existing = await tx.stockLog.findUnique({ where: { idempotencyKey } })
  if (existing) return { movement: existing, duplicate: true }

  const receiptMovement = input.sourceMovementId
    ? await tx.stockLog.findUnique({ where: { id: input.sourceMovementId } })
    : await tx.stockLog.findUnique({
      where: { idempotencyKey: `CUTTING_TASK_SOURCE:${input.taskSourceId}:REMNANT_IN` },
    })
  if (!receiptMovement || receiptMovement.reversalMovementId) {
    throw new Error(`锯切任务 ${input.taskNo} 的余料库存流水不存在或已冲销`)
  }

  const layers = await tx.inventoryCostLayer.findMany({
    where: {
      materialId: input.materialId,
      sourceType: 'CUTTING_TASK_REMNANT',
      sourceId: input.taskSourceId,
    },
  })
  for (const layer of layers) {
    if (
      Math.abs(Number(layer.remainingStockQty) - Number(layer.stockQty)) > tolerance
      || Math.abs(Number(layer.remainingValuationQty) - Number(layer.valuationQty)) > tolerance
    ) {
      throw new Error(`锯切任务 ${input.taskNo} 的余料成本层已被后续耗用，不能冲销`)
    }
  }

  const { material, stock } = await loadMaterialStock(tx, input.materialId)
  const stockQty = Number(receiptMovement.qty)
  const valuationQty = Number(receiptMovement.valuationQty || 0)
  const costAmount = Number(receiptMovement.costAmount || 0)
  if (Number(stock.availableQty) + tolerance < stockQty || Number(stock.availableValuationQty) + tolerance < valuationQty) {
    throw new Error(`锯切任务 ${input.taskNo} 的余料已不在可用库存，不能冲销`)
  }

  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const beforeReservedQty = Number(stock.reservedQty)
  const beforeAvailableQty = Number(stock.availableQty)
  const beforeReservedValuationQty = Number(stock.reservedValuationQty)
  const beforeAvailableValuationQty = Number(stock.availableValuationQty)
  const afterQty = roundQty(beforeQty - stockQty)
  const afterValuationQty = Math.max(0, roundQty(beforeValuationQty - valuationQty))
  const afterCostAmount = Math.max(0, roundQty(beforeCostAmount - costAmount))
  const afterAvailableQty = roundQty(beforeAvailableQty - stockQty)
  const afterAvailableValuationQty = Math.max(0, roundQty(beforeAvailableValuationQty - valuationQty))

  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: afterAvailableQty,
      valuationQty: afterValuationQty,
      availableValuationQty: afterAvailableValuationQty,
      totalCost: afterCostAmount,
      valuationUnitCost: afterValuationQty > 0 ? afterCostAmount / afterValuationQty : 0,
      stockUnitCost: afterQty > 0 ? afterCostAmount / afterQty : 0,
    },
  })
  if (layers.length > 0) {
    await tx.inventoryCostLayer.updateMany({
      where: { id: { in: layers.map((item) => item.id) } },
      data: {
        remainingStockQty: 0,
        remainingValuationQty: 0,
        remainingAmount: 0,
        status: 'REVERSED',
      },
    })
  }
  const movement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      type: 'CUTTING_REMNANT_REVERSAL',
      qty: -stockQty,
      beforeQty,
      afterQty,
      valuationQty: -valuationQty,
      beforeValuationQty,
      afterValuationQty,
      costAmount: -costAmount,
      beforeCostAmount,
      afterCostAmount,
      stockUnitSnapshot: material.stockUnit || material.unit,
      valuationUnitSnapshot: material.valuationUnit || material.unit,
      conversionRateUsed: stockQty > 0 ? roundQty(valuationQty / stockQty) : 0,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costingMethodSnapshot: material.costingMethod,
      beforeReservedQty,
      afterReservedQty: beforeReservedQty,
      beforeAvailableQty,
      afterAvailableQty,
      beforeReservedValuationQty,
      afterReservedValuationQty: beforeReservedValuationQty,
      beforeAvailableValuationQty,
      afterAvailableValuationQty,
      sourceMovementId: receiptMovement.id,
      idempotencyKey,
      refType: 'CUTTING_TASK_REMNANT_REVERSAL',
      refId: input.taskSourceId,
      note: `冲销锯切任务 ${input.taskNo} 的余料回库：${input.reason}`,
      createdBy: input.actor.name || null,
    },
  })
  await tx.stockLog.update({
    where: { id: receiptMovement.id },
    data: { reversalMovementId: movement.id },
  })
  return { movement, duplicate: false }
}
