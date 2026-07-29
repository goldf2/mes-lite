import { Prisma } from '@prisma/client'
import { postInventoryReceipt } from './inventory'

const tolerance = 0.000001
const roundValue = (value: number) => Number(value.toFixed(6))

export type ProductionLotActor = {
  id?: string | null
  name?: string | null
}

type LotBuckets = {
  pendingDrillingQty: number
  pendingQcQty: number
  reworkQty: number
  passedQty: number
  scrappedQty: number
  stockedQty: number
  cutGoodQty: number
  reversedAt?: Date | null
}

function deriveLotStatus(lot: LotBuckets) {
  if (lot.reversedAt) return 'REVERSED'
  if (lot.pendingDrillingQty > 0) return 'WAITING_DRILLING'
  if (lot.pendingQcQty > 0) return 'WAITING_QC'
  if (lot.reworkQty > 0) return 'REWORK_PENDING'
  if (lot.passedQty > lot.stockedQty) return 'WAITING_STOCK_IN'
  if (lot.stockedQty > 0) return 'COMPLETED'
  if (lot.scrappedQty >= lot.cutGoodQty) return 'SCRAPPED'
  return 'IN_PROGRESS'
}

function parseProcessSnapshot(value: string | null) {
  if (!value) return { steps: [] as Array<Record<string, unknown>> }
  try {
    const parsed = JSON.parse(value)
    return { steps: Array.isArray(parsed?.steps) ? parsed.steps as Array<Record<string, unknown>> : [] }
  } catch {
    throw new Error('工单工艺快照损坏，不能生成后续生产批次')
  }
}

function isDrillingStep(step: Record<string, unknown>) {
  const category = String(step.templateCategory || '').toUpperCase()
  const templateCode = String(step.templateCode || '').toUpperCase()
  const name = String(step.name || '')
  return category === 'DRILLING' || templateCode === 'DRILLING' || name.includes('钻孔')
}

export async function createProductionLotsForCuttingTask(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    netMaterialCostAmount: number
  },
) {
  const task = await tx.cuttingTask.findUniqueOrThrow({
    where: { id: input.taskId },
    include: {
      sources: { include: { outputs: true } },
    },
  })
  const outputByDemand = new Map<string, { goodQty: number; goodLengthMm: number }>()
  for (const source of task.sources) {
    for (const output of source.outputs) {
      if (output.goodQty <= 0) continue
      const current = outputByDemand.get(output.cuttingDemandId) || { goodQty: 0, goodLengthMm: 0 }
      current.goodQty += output.goodQty
      current.goodLengthMm += output.goodQty * Number(output.pieceLengthMm)
      outputByDemand.set(output.cuttingDemandId, current)
    }
  }
  const totalGoodLengthMm = Array.from(outputByDemand.values()).reduce((sum, item) => sum + item.goodLengthMm, 0)
  const lots = []
  let index = 0
  for (const [demandId, output] of Array.from(outputByDemand.entries())) {
    index += 1
    const sourceKey = `CUTTING_TASK_DEMAND:${task.id}:${demandId}`
    const existing = await tx.productionLot.findUnique({ where: { sourceKey } })
    if (existing) {
      lots.push(existing)
      continue
    }
    const demand = await tx.cuttingDemand.findUniqueOrThrow({
      where: { id: demandId },
      include: { productionOrder: true },
    })
    if (!demand.outputMaterialId) {
      throw new Error(`切割需求 ${demand.demandNo} 没有成品物料，不能建立后续生产批次`)
    }
    const processSnapshot = parseProcessSnapshot(demand.productionOrder.processSnapshot)
    const drillingSteps = processSnapshot.steps.filter(isDrillingStep)
    const requiresDrilling = drillingSteps.length > 0
    const materialCostAmount = totalGoodLengthMm > 0
      ? roundValue(input.netMaterialCostAmount * output.goodLengthMm / totalGoodLengthMm)
      : 0
    const lot = await tx.productionLot.create({
      data: {
        lotNo: `PL-${task.taskNo}-${String(index).padStart(3, '0')}`,
        sourceKey,
        cuttingTaskId: task.id,
        cuttingDemandId: demand.id,
        productionOrderId: demand.productionOrderId,
        outputMaterialId: demand.outputMaterialId,
        status: requiresDrilling ? 'WAITING_DRILLING' : 'WAITING_QC',
        requiresDrilling,
        processSnapshot: demand.productionOrder.processSnapshot,
        drillingSpecSnapshot: drillingSteps.length > 0 ? JSON.stringify(drillingSteps) : null,
        cutGoodQty: output.goodQty,
        pendingDrillingQty: requiresDrilling ? output.goodQty : 0,
        pendingQcQty: requiresDrilling ? 0 : output.goodQty,
        materialCostAmount,
        unitMaterialCost: output.goodQty > 0 ? roundValue(materialCostAmount / output.goodQty) : 0,
      },
    })
    lots.push(lot)
  }
  const orderIds = Array.from(new Set(lots.map((item) => item.productionOrderId)))
  for (const orderId of orderIds) await refreshProductionOrderFromLots(tx, orderId)
  return lots
}

export async function ensureCuttingTaskLotsReversible(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string
    reason: string
    actor: ProductionLotActor
  },
) {
  const lots = await tx.productionLot.findMany({
    where: { cuttingTaskId: input.taskId },
    include: {
      drillingReports: { where: { status: 'CONFIRMED' }, select: { id: true } },
      qualityInspections: { where: { status: 'CONFIRMED' }, select: { id: true } },
      stockIns: { where: { status: 'CONFIRMED' }, select: { id: true } },
    },
  })
  for (const lot of lots) {
    const initialBucketIntact = lot.requiresDrilling
      ? lot.pendingDrillingQty === lot.cutGoodQty && lot.pendingQcQty === 0
      : lot.pendingQcQty === lot.cutGoodQty && lot.pendingDrillingQty === 0
    if (
      !initialBucketIntact
      || lot.reworkQty !== 0
      || lot.passedQty !== 0
      || lot.scrappedQty !== 0
      || lot.stockedQty !== 0
      || lot.drillingReports.length > 0
      || lot.qualityInspections.length > 0
      || lot.stockIns.length > 0
    ) {
      throw new Error(`生产批次 ${lot.lotNo} 已进入钻孔、质检或入库，不能冲销来源锯切任务`)
    }
  }
  for (const lot of lots) {
    await tx.productionLot.update({
      where: { id: lot.id },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversedBy: input.actor.name || null,
        reverseReason: input.reason,
      },
    })
  }
  return lots
}

export async function refreshProductionOrderFromLots(tx: Prisma.TransactionClient, orderId: string) {
  const [order, lots] = await Promise.all([
    tx.productionOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { cuttingDemands: true },
    }),
    tx.productionLot.findMany({
      where: { productionOrderId: orderId, reversedAt: null },
    }),
  ])
  const completeQty = lots.reduce((sum, lot) => sum + lot.stockedQty, 0)
  const scrapQty = lots.reduce((sum, lot) => sum + lot.scrappedQty, 0)
  const hasPendingDrilling = lots.some((lot) => lot.pendingDrillingQty > 0)
  const hasPendingQcOrRework = lots.some((lot) => lot.pendingQcQty > 0 || lot.reworkQty > 0)
  const hasUnstockedPassed = lots.some((lot) => lot.passedQty > lot.stockedQty)
  const hasOpenCuttingDemand = order.cuttingDemands.some((demand) => demand.completedQty < demand.requiredQty)
  const allLotOutputSettled = lots.length > 0 && lots.every((lot) => (
    lot.pendingDrillingQty === 0
    && lot.pendingQcQty === 0
    && lot.reworkQty === 0
    && lot.passedQty === lot.stockedQty
  ))
  let status = order.status
  if (hasPendingDrilling) status = 'RUNNING'
  else if (hasPendingQcOrRework) status = 'QC_WAITING'
  else if (hasUnstockedPassed) status = 'QC_DONE'
  else if (allLotOutputSettled && !hasOpenCuttingDemand) status = 'COMPLETED'
  else if (lots.length > 0) status = 'RUNNING'
  else if (order.cuttingDemands.length > 0) status = 'RUNNING'

  await tx.productionOrder.update({
    where: { id: order.id },
    data: {
      status,
      completeQty,
      scrapQty,
      ...(status === 'COMPLETED' ? { completeTime: new Date() } : {}),
    },
  })
}

async function loadMutableLot(tx: Prisma.TransactionClient, lotId: string) {
  const lot = await tx.productionLot.findUnique({
    where: { id: lotId },
    include: {
      outputMaterial: true,
      productionOrder: true,
    },
  })
  if (!lot) throw new Error('生产批次不存在')
  if (lot.reversedAt || lot.status === 'REVERSED') throw new Error('生产批次已冲销')
  return lot
}

export async function reportDrilling(
  tx: Prisma.TransactionClient,
  input: {
    productionLotId: string
    clientRequestId: string
    operationType: 'INITIAL' | 'REWORK'
    inputQty: number
    goodQty: number
    reworkQty: number
    scrapQty: number
    holeType?: string | null
    drawingNo?: string | null
    note?: string | null
    actor: ProductionLotActor
  },
) {
  const existing = await tx.drillingReport.findUnique({ where: { clientRequestId: input.clientRequestId } })
  if (existing) return existing
  const lot = await loadMutableLot(tx, input.productionLotId)
  if (!lot.requiresDrilling) throw new Error(`生产批次 ${lot.lotNo} 不需要钻孔，可直接质检`)
  if (!Number.isInteger(input.inputQty) || input.inputQty <= 0) throw new Error('钻孔投入数量必须为正整数')
  if (
    !Number.isInteger(input.goodQty) || input.goodQty < 0
    || !Number.isInteger(input.reworkQty) || input.reworkQty < 0
    || !Number.isInteger(input.scrapQty) || input.scrapQty < 0
  ) {
    throw new Error('钻孔合格、返工和报废数量必须为非负整数')
  }
  if (input.goodQty + input.reworkQty + input.scrapQty !== input.inputQty) {
    throw new Error('钻孔合格、返工和报废数量之和必须等于投入数量')
  }
  const sourceBucket = input.operationType === 'INITIAL' ? 'DRILLING_PENDING' : 'REWORK_PENDING'
  const sourceQty = sourceBucket === 'DRILLING_PENDING' ? lot.pendingDrillingQty : lot.reworkQty
  if (input.inputQty > sourceQty) throw new Error(`钻孔投入超过当前可处理数量 ${sourceQty}`)

  const now = new Date()
  const dateText = now.toISOString().slice(0, 10).replace(/-/g, '')
  const dailyCount = await tx.drillingReport.count({
    where: { createdAt: { gte: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) } },
  })
  const nextBuckets = {
    pendingDrillingQty: lot.pendingDrillingQty - (sourceBucket === 'DRILLING_PENDING' ? input.inputQty : 0),
    pendingQcQty: lot.pendingQcQty + input.goodQty,
    reworkQty: lot.reworkQty - (sourceBucket === 'REWORK_PENDING' ? input.inputQty : 0) + input.reworkQty,
    passedQty: lot.passedQty,
    scrappedQty: lot.scrappedQty + input.scrapQty,
    stockedQty: lot.stockedQty,
    cutGoodQty: lot.cutGoodQty,
  }
  const report = await tx.drillingReport.create({
    data: {
      reportNo: `DR-${dateText}-${String(dailyCount + 1).padStart(3, '0')}`,
      clientRequestId: input.clientRequestId,
      productionLotId: lot.id,
      operationType: input.operationType,
      sourceBucket,
      inputQty: input.inputQty,
      goodQty: input.goodQty,
      reworkQty: input.reworkQty,
      scrapQty: input.scrapQty,
      holeType: input.holeType?.trim() || null,
      drawingNo: input.drawingNo?.trim() || null,
      note: input.note?.trim() || null,
      operatorId: input.actor.id || null,
      operatorName: input.actor.name || null,
      startedAt: now,
      completedAt: now,
    },
  })
  await tx.productionLot.update({
    where: { id: lot.id },
    data: {
      pendingDrillingQty: nextBuckets.pendingDrillingQty,
      pendingQcQty: nextBuckets.pendingQcQty,
      reworkQty: nextBuckets.reworkQty,
      scrappedQty: nextBuckets.scrappedQty,
      status: deriveLotStatus(nextBuckets),
    },
  })
  await refreshProductionOrderFromLots(tx, lot.productionOrderId)
  return report
}

async function ensureNoLaterLotActivity(
  tx: Prisma.TransactionClient,
  lotId: string,
  createdAt: Date,
  sourceLabel: string,
) {
  const [laterDrilling, laterQuality, laterStockIn] = await Promise.all([
    tx.drillingReport.count({
      where: { productionLotId: lotId, status: 'CONFIRMED', createdAt: { gt: createdAt } },
    }),
    tx.qualityInspection.count({
      where: { productionLotId: lotId, status: 'CONFIRMED', createdAt: { gt: createdAt } },
    }),
    tx.stockIn.count({
      where: { productionLotId: lotId, status: 'CONFIRMED', inDate: { gt: createdAt } },
    }),
  ])
  if (laterDrilling + laterQuality + laterStockIn > 0) {
    throw new Error(`${sourceLabel} 之后已有钻孔、质检或入库记录，请按时间倒序冲销`)
  }
}

export async function reverseDrillingReport(
  tx: Prisma.TransactionClient,
  input: {
    reportId: string
    productionLotId?: string
    reason: string
    actor: ProductionLotActor
  },
) {
  const report = await tx.drillingReport.findUnique({
    where: { id: input.reportId },
    include: { productionLot: true },
  })
  if (!report) throw new Error('钻孔实绩不存在')
  if (input.productionLotId && report.productionLotId !== input.productionLotId) {
    throw new Error('钻孔实绩不属于该生产批次')
  }
  if (report.status === 'REVERSED') return report
  if (report.status !== 'CONFIRMED') throw new Error('只有已确认钻孔实绩可以冲销')
  await ensureNoLaterLotActivity(tx, report.productionLotId, report.createdAt, `钻孔实绩 ${report.reportNo}`)
  const lot = report.productionLot
  if (lot.pendingQcQty < report.goodQty || lot.reworkQty < report.reworkQty || lot.scrappedQty < report.scrapQty) {
    throw new Error('钻孔产出数量已被后续使用，不能冲销')
  }
  const nextBuckets = {
    pendingDrillingQty: lot.pendingDrillingQty + (report.sourceBucket === 'DRILLING_PENDING' ? report.inputQty : 0),
    pendingQcQty: lot.pendingQcQty - report.goodQty,
    reworkQty: lot.reworkQty - report.reworkQty + (report.sourceBucket === 'REWORK_PENDING' ? report.inputQty : 0),
    passedQty: lot.passedQty,
    scrappedQty: lot.scrappedQty - report.scrapQty,
    stockedQty: lot.stockedQty,
    cutGoodQty: lot.cutGoodQty,
  }
  await tx.productionLot.update({
    where: { id: lot.id },
    data: {
      pendingDrillingQty: nextBuckets.pendingDrillingQty,
      pendingQcQty: nextBuckets.pendingQcQty,
      reworkQty: nextBuckets.reworkQty,
      scrappedQty: nextBuckets.scrappedQty,
      status: deriveLotStatus(nextBuckets),
    },
  })
  const reversed = await tx.drillingReport.update({
    where: { id: report.id },
    data: {
      status: 'REVERSED',
      reversedAt: new Date(),
      reversedBy: input.actor.name || null,
      reversedById: input.actor.id || null,
      reverseReason: input.reason,
    },
  })
  await refreshProductionOrderFromLots(tx, lot.productionOrderId)
  return reversed
}

export async function recordQualityInspection(
  tx: Prisma.TransactionClient,
  input: {
    productionLotId: string
    clientRequestId: string
    sourceBucket: 'QC_PENDING' | 'REWORK_PENDING'
    inputQty: number
    sampleQty: number
    passedQty: number
    reworkQty: number
    scrapQty: number
    badReason?: string | null
    note?: string | null
    actor: ProductionLotActor
  },
) {
  const existing = await tx.qualityInspection.findUnique({ where: { clientRequestId: input.clientRequestId } })
  if (existing) return existing
  const lot = await loadMutableLot(tx, input.productionLotId)
  if (!Number.isInteger(input.inputQty) || input.inputQty <= 0) throw new Error('质检数量必须为正整数')
  if (!Number.isInteger(input.sampleQty) || input.sampleQty <= 0 || input.sampleQty > input.inputQty) {
    throw new Error('抽检数量必须为 1 到本次质检数量')
  }
  if (
    !Number.isInteger(input.passedQty) || input.passedQty < 0
    || !Number.isInteger(input.reworkQty) || input.reworkQty < 0
    || !Number.isInteger(input.scrapQty) || input.scrapQty < 0
  ) {
    throw new Error('质检合格、返工和报废数量必须为非负整数')
  }
  if (input.passedQty + input.reworkQty + input.scrapQty !== input.inputQty) {
    throw new Error('质检合格、返工和报废数量之和必须等于质检数量')
  }
  const sourceQty = input.sourceBucket === 'QC_PENDING' ? lot.pendingQcQty : lot.reworkQty
  if (input.inputQty > sourceQty) throw new Error(`本次质检超过当前可检数量 ${sourceQty}`)
  const now = new Date()
  const dateText = now.toISOString().slice(0, 10).replace(/-/g, '')
  const dailyCount = await tx.qualityInspection.count({
    where: { createdAt: { gte: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) } },
  })
  const result = input.reworkQty === 0 && input.scrapQty === 0
    ? 'PASSED'
    : input.passedQty > 0 ? 'PARTIAL' : 'FAILED'
  const nextBuckets = {
    pendingDrillingQty: lot.pendingDrillingQty,
    pendingQcQty: lot.pendingQcQty - (input.sourceBucket === 'QC_PENDING' ? input.inputQty : 0),
    reworkQty: lot.reworkQty - (input.sourceBucket === 'REWORK_PENDING' ? input.inputQty : 0) + input.reworkQty,
    passedQty: lot.passedQty + input.passedQty,
    scrappedQty: lot.scrappedQty + input.scrapQty,
    stockedQty: lot.stockedQty,
    cutGoodQty: lot.cutGoodQty,
  }
  const inspection = await tx.qualityInspection.create({
    data: {
      inspectionNo: `QI-${dateText}-${String(dailyCount + 1).padStart(3, '0')}`,
      clientRequestId: input.clientRequestId,
      productionLotId: lot.id,
      inspectionType: input.sourceBucket === 'REWORK_PENDING' ? 'REINSPECTION' : 'INITIAL',
      sourceBucket: input.sourceBucket,
      inputQty: input.inputQty,
      sampleQty: input.sampleQty,
      passedQty: input.passedQty,
      reworkQty: input.reworkQty,
      scrapQty: input.scrapQty,
      result,
      badReason: input.badReason?.trim() || null,
      note: input.note?.trim() || null,
      inspectorId: input.actor.id || null,
      inspectorName: input.actor.name || '未署名',
      checkedAt: now,
    },
  })
  await tx.productionLot.update({
    where: { id: lot.id },
    data: {
      pendingQcQty: nextBuckets.pendingQcQty,
      reworkQty: nextBuckets.reworkQty,
      passedQty: nextBuckets.passedQty,
      scrappedQty: nextBuckets.scrappedQty,
      status: deriveLotStatus(nextBuckets),
    },
  })
  await refreshProductionOrderFromLots(tx, lot.productionOrderId)
  return inspection
}

export async function reverseQualityInspection(
  tx: Prisma.TransactionClient,
  input: {
    inspectionId: string
    productionLotId?: string
    reason: string
    actor: ProductionLotActor
  },
) {
  const inspection = await tx.qualityInspection.findUnique({
    where: { id: input.inspectionId },
    include: { productionLot: true },
  })
  if (!inspection) throw new Error('质检记录不存在')
  if (input.productionLotId && inspection.productionLotId !== input.productionLotId) {
    throw new Error('质检记录不属于该生产批次')
  }
  if (inspection.status === 'REVERSED') return inspection
  if (inspection.status !== 'CONFIRMED') throw new Error('只有已确认质检记录可以冲销')
  await ensureNoLaterLotActivity(tx, inspection.productionLotId, inspection.createdAt, `质检记录 ${inspection.inspectionNo}`)
  const lot = inspection.productionLot
  if (
    lot.passedQty - lot.stockedQty < inspection.passedQty
    || lot.reworkQty < inspection.reworkQty
    || lot.scrappedQty < inspection.scrapQty
  ) {
    throw new Error('质检产出已被入库或后续使用，不能冲销')
  }
  const nextBuckets = {
    pendingDrillingQty: lot.pendingDrillingQty,
    pendingQcQty: lot.pendingQcQty + (inspection.sourceBucket === 'QC_PENDING' ? inspection.inputQty : 0),
    reworkQty: lot.reworkQty - inspection.reworkQty + (inspection.sourceBucket === 'REWORK_PENDING' ? inspection.inputQty : 0),
    passedQty: lot.passedQty - inspection.passedQty,
    scrappedQty: lot.scrappedQty - inspection.scrapQty,
    stockedQty: lot.stockedQty,
    cutGoodQty: lot.cutGoodQty,
  }
  await tx.productionLot.update({
    where: { id: lot.id },
    data: {
      pendingQcQty: nextBuckets.pendingQcQty,
      reworkQty: nextBuckets.reworkQty,
      passedQty: nextBuckets.passedQty,
      scrappedQty: nextBuckets.scrappedQty,
      status: deriveLotStatus(nextBuckets),
    },
  })
  const reversed = await tx.qualityInspection.update({
    where: { id: inspection.id },
    data: {
      status: 'REVERSED',
      reversedAt: new Date(),
      reversedBy: input.actor.name || null,
      reversedById: input.actor.id || null,
      reverseReason: input.reason,
    },
  })
  await refreshProductionOrderFromLots(tx, lot.productionOrderId)
  return reversed
}

export async function stockInProductionLot(
  tx: Prisma.TransactionClient,
  input: {
    productionLotId: string
    clientRequestId: string
    qty: number
    batchNo?: string | null
    note?: string | null
    actor: ProductionLotActor
  },
) {
  const existing = await tx.stockIn.findUnique({ where: { clientRequestId: input.clientRequestId } })
  if (existing) return existing
  const lot = await loadMutableLot(tx, input.productionLotId)
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new Error('成品入库数量必须为正整数')
  const availablePassedQty = lot.passedQty - lot.stockedQty
  if (input.qty > availablePassedQty) throw new Error(`入库数量超过当前质检合格可入库数量 ${availablePassedQty}`)
  const stockIn = await tx.stockIn.create({
    data: {
      orderId: lot.productionOrderId,
      productId: lot.productionOrder.productId,
      productionLotId: lot.id,
      materialId: lot.outputMaterialId,
      clientRequestId: input.clientRequestId,
      status: 'CONFIRMED',
      qty: input.qty,
      batchNo: input.batchNo?.trim() || null,
      inBy: input.actor.name || null,
      note: input.note?.trim() || null,
    },
  })
  const costAmount = roundValue(lot.unitMaterialCost * input.qty)
  const receipt = await postInventoryReceipt(tx, {
    materialId: lot.outputMaterialId,
    stockQty: input.qty,
    costAmount,
    type: 'PRODUCTION_LOT_IN',
    refType: 'PRODUCTION_LOT_STOCK_IN',
    refId: stockIn.id,
    note: `生产批次 ${lot.lotNo} 质检合格入库`,
    createdBy: input.actor.name || null,
    idempotencyKey: `PRODUCTION_LOT_STOCK_IN:${stockIn.id}`,
  })
  const updatedStockIn = await tx.stockIn.update({
    where: { id: stockIn.id },
    data: {
      valuationQty: receipt.quantities?.valuationQty || 0,
      costAmount,
      stockLogId: receipt.movement.id,
    },
  })
  const nextBuckets = {
    pendingDrillingQty: lot.pendingDrillingQty,
    pendingQcQty: lot.pendingQcQty,
    reworkQty: lot.reworkQty,
    passedQty: lot.passedQty,
    scrappedQty: lot.scrappedQty,
    stockedQty: lot.stockedQty + input.qty,
    cutGoodQty: lot.cutGoodQty,
  }
  await tx.productionLot.update({
    where: { id: lot.id },
    data: {
      stockedQty: nextBuckets.stockedQty,
      stockedCostAmount: roundValue(lot.stockedCostAmount + costAmount),
      status: deriveLotStatus(nextBuckets),
    },
  })
  await refreshProductionOrderFromLots(tx, lot.productionOrderId)
  return updatedStockIn
}

export async function reverseProductionLotStockIn(
  tx: Prisma.TransactionClient,
  input: {
    stockInId: string
    productionLotId?: string
    reason: string
    actor: ProductionLotActor
  },
) {
  const stockIn = await tx.stockIn.findUnique({
    where: { id: input.stockInId },
    include: {
      productionLot: true,
      material: { include: { stock: true } },
    },
  })
  if (!stockIn || !stockIn.productionLot || !stockIn.material) throw new Error('生产批次入库记录不存在')
  if (input.productionLotId && stockIn.productionLotId !== input.productionLotId) {
    throw new Error('入库记录不属于该生产批次')
  }
  if (stockIn.status === 'REVERSED') return stockIn
  if (stockIn.status !== 'CONFIRMED') throw new Error('只有已确认成品入库可以冲销')
  const lot = stockIn.productionLot
  const stock = stockIn.material.stock
  if (!stock) throw new Error('成品库存总账不存在')
  if (Number(stock.availableQty) + tolerance < stockIn.qty || Number(stock.availableValuationQty) + tolerance < stockIn.valuationQty) {
    throw new Error('该批成品已被后续占用或发货，不能冲销入库')
  }
  const layers = await tx.inventoryCostLayer.findMany({
    where: {
      materialId: stockIn.materialId as string,
      sourceType: 'PRODUCTION_LOT_STOCK_IN',
      sourceId: stockIn.id,
    },
  })
  for (const layer of layers) {
    if (
      Math.abs(Number(layer.remainingStockQty) - Number(layer.stockQty)) > tolerance
      || Math.abs(Number(layer.remainingValuationQty) - Number(layer.valuationQty)) > tolerance
    ) {
      throw new Error('该批成品成本层已被后续耗用，不能冲销入库')
    }
  }

  const beforeQty = Number(stock.qty)
  const beforeValuationQty = Number(stock.valuationQty)
  const beforeCostAmount = Number(stock.totalCost)
  const afterQty = roundValue(beforeQty - stockIn.qty)
  const afterValuationQty = Math.max(0, roundValue(beforeValuationQty - stockIn.valuationQty))
  const afterCostAmount = Math.max(0, roundValue(beforeCostAmount - stockIn.costAmount))
  await tx.stock.update({
    where: { id: stock.id },
    data: {
      qty: afterQty,
      availableQty: roundValue(Number(stock.availableQty) - stockIn.qty),
      valuationQty: afterValuationQty,
      availableValuationQty: Math.max(0, roundValue(Number(stock.availableValuationQty) - stockIn.valuationQty)),
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
  const sourceMovement = stockIn.stockLogId
    ? await tx.stockLog.findUnique({ where: { id: stockIn.stockLogId } })
    : null
  const reversalMovement = await tx.stockLog.create({
    data: {
      stockId: stock.id,
      type: 'PRODUCTION_LOT_IN_REVERSAL',
      qty: -stockIn.qty,
      beforeQty,
      afterQty,
      valuationQty: -stockIn.valuationQty,
      beforeValuationQty,
      afterValuationQty,
      costAmount: -stockIn.costAmount,
      beforeCostAmount,
      afterCostAmount,
      stockUnitSnapshot: stockIn.material.stockUnit || stockIn.material.unit,
      valuationUnitSnapshot: stockIn.material.valuationUnit || stockIn.material.unit,
      conversionRateUsed: stockIn.qty > 0 ? roundValue(stockIn.valuationQty / stockIn.qty) : 0,
      conversionSource: 'ORIGINAL_MOVEMENT',
      costingMethodSnapshot: stockIn.material.costingMethod,
      sourceMovementId: sourceMovement?.id,
      idempotencyKey: `PRODUCTION_LOT_STOCK_IN:${stockIn.id}:REVERSE`,
      refType: 'PRODUCTION_LOT_STOCK_IN_REVERSAL',
      refId: stockIn.id,
      note: `冲销生产批次 ${lot.lotNo} 成品入库：${input.reason}`,
      createdBy: input.actor.name || null,
    },
  })
  if (sourceMovement) {
    await tx.stockLog.update({
      where: { id: sourceMovement.id },
      data: { reversalMovementId: reversalMovement.id },
    })
  }
  const reversed = await tx.stockIn.update({
    where: { id: stockIn.id },
    data: {
      status: 'REVERSED',
      reversedAt: new Date(),
      reversedBy: input.actor.name || null,
      reverseReason: input.reason,
    },
  })
  const nextBuckets = {
    pendingDrillingQty: lot.pendingDrillingQty,
    pendingQcQty: lot.pendingQcQty,
    reworkQty: lot.reworkQty,
    passedQty: lot.passedQty,
    scrappedQty: lot.scrappedQty,
    stockedQty: lot.stockedQty - stockIn.qty,
    cutGoodQty: lot.cutGoodQty,
  }
  await tx.productionLot.update({
    where: { id: lot.id },
    data: {
      stockedQty: nextBuckets.stockedQty,
      stockedCostAmount: Math.max(0, roundValue(lot.stockedCostAmount - stockIn.costAmount)),
      status: deriveLotStatus(nextBuckets),
    },
  })
  await refreshProductionOrderFromLots(tx, lot.productionOrderId)
  return reversed
}
