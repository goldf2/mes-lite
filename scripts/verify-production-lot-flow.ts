import { Prisma, PrismaClient } from '@prisma/client'
import {
  confirmCuttingPlan,
  generateCuttingDemandsForOrder,
  loadProductionOrderSnapshots,
} from '../lib/cutting'
import {
  completeCuttingTask,
  releaseCuttingTask,
  reverseCuttingTask,
  startCuttingTask,
} from '../lib/cutting-execution'
import {
  recordQualityInspection,
  reportDrilling,
  reverseDrillingReport,
  reverseProductionLotStockIn,
  reverseQualityInspection,
  stockInProductionLot,
} from '../lib/production-lot'

const prisma = new PrismaClient()
const rollbackMarker = 'VERIFY_PRODUCTION_LOT_ROLLBACK'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function createProductAndOrder(
  tx: Prisma.TransactionClient,
  input: {
    suffix: string
    key: string
    rawMaterialId: string
    outputMaterialId: string
    drillingTemplateId?: string
    drillingTemplateCode?: string
    sawingTemplateId: string
    sawingTemplateCode: string
  },
) {
  const product = await tx.product.create({
    data: {
      sku: `VERIFY-LOT-${input.key}-P-${input.suffix}`,
      name: `批次验证成品 ${input.key}`,
      category: 'FINISHED',
      unit: '件',
      bom: {
        create: {
          version: 'v1',
          outputQuantity: 1,
          outputUnit: '件',
          items: {
            create: {
              itemType: 'MATERIAL',
              materialId: input.rawMaterialId,
              quantity: 1,
              unit: '根',
              cutLengthMm: 1500,
            },
          },
        },
      },
      processRoutes: {
        create: {
          name: `批次验证工艺 ${input.key}`,
          isDefault: true,
          steps: {
            create: [
              {
                stepNo: 10,
                name: '锯切',
                templateId: input.sawingTemplateId,
                templateCode: input.sawingTemplateCode,
              },
              ...(input.drillingTemplateId ? [{
                stepNo: 20,
                name: '钻孔',
                templateId: input.drillingTemplateId,
                templateCode: input.drillingTemplateCode,
                description: '孔型及图纸以现场实绩为准',
              }] : []),
            ],
          },
        },
      },
    },
  })
  const snapshots = await loadProductionOrderSnapshots(tx, product.id)
  assert(snapshots.bomSnapshot && snapshots.processSnapshot, '未生成工单快照')
  const order = await tx.productionOrder.create({
    data: {
      orderNo: `VERIFY-LOT-${input.key}-WO-${input.suffix}`,
      productId: product.id,
      materialId: input.outputMaterialId,
      planQty: 2,
      status: 'CONFIRMED',
      bomVersionSnapshot: snapshots.bomSnapshot.version,
      bomSnapshot: JSON.stringify(snapshots.bomSnapshot),
      processSnapshot: JSON.stringify(snapshots.processSnapshot),
      snapshotCreatedAt: new Date(),
    },
  })
  return { product, order, snapshots }
}

async function cutOrder(
  tx: Prisma.TransactionClient,
  input: {
    suffix: string
    key: string
    orderId: string
    entityId: string
  },
) {
  const demand = (await generateCuttingDemandsForOrder(tx, input.orderId)).demands[0]
  const plan = await confirmCuttingPlan(tx, {
    clientRequestId: `verify-lot-${input.key}-plan-${input.suffix}`,
    demandLines: [{ demandId: demand.id, requestedQty: 2 }],
    sources: [{ entityId: input.entityId, selectedQty: 1 }],
  }, { name: '生产批次验证脚本' })
  const task = await releaseCuttingTask(tx, {
    cuttingPlanId: plan.id,
    clientRequestId: `verify-lot-${input.key}-task-${input.suffix}`,
  })
  await startCuttingTask(tx, { taskId: task.id, actor: { name: '生产批次验证脚本' } })
  const planSource = await tx.cuttingPlanSource.findFirstOrThrow({
    where: { planId: plan.id },
    include: { cuts: { include: { planDemand: true } } },
  })
  const completed = await completeCuttingTask(tx, {
    taskId: task.id,
    completion: {
      clientRequestId: `verify-lot-${input.key}-complete-${input.suffix}`,
      sources: [{
        planSourceId: planSource.id,
        actualSourceLengthMm: 3000,
        actualRemainingLengthMm: 0,
        actualKerfLossMm: 0,
        actualFixedLossMm: 0,
        actualOtherLossMm: 0,
        disposition: 'SCRAP',
        outputs: planSource.cuts.map((cut) => ({
          cuttingDemandId: cut.planDemand.demandId,
          goodQty: cut.plannedQty,
          badQty: 0,
          scrapQty: 0,
        })),
      }],
    },
    actor: { name: '生产批次验证脚本' },
  })
  const lot = await tx.productionLot.findFirstOrThrow({ where: { cuttingTaskId: completed.id } })
  return { demand, plan, task: completed, lot }
}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const sawingTemplate = await tx.processTemplate.create({
        data: {
          code: `VERIFY-LOT-SAW-${suffix}`,
          name: '验证锯切',
          category: 'SAWING',
        },
      })
      const drillingTemplate = await tx.processTemplate.create({
        data: {
          code: `VERIFY-LOT-DRILL-${suffix}`,
          name: '验证钻孔',
          category: 'DRILLING',
        },
      })
      const rawMaterial = await tx.material.create({
        data: {
          code: `VERIFY-LOT-RAW-${suffix}`,
          name: '生产批次验证原料',
          category: 'RAW',
          unit: '根',
          stockUnit: '根',
          valuationUnit: 'kg',
          conversionRate: 10,
          costingMethod: 'FIFO',
          stock: {
            create: {
              qty: 2,
              availableQty: 2,
              valuationQty: 20,
              availableValuationQty: 20,
              totalCost: 200,
              valuationUnitCost: 10,
              stockUnitCost: 100,
            },
          },
          profileSpec: { create: { sectionDescription: '生产批次验证截面', trackingMode: 'BATCH' } },
          costLayers: {
            create: {
              sourceType: 'VERIFY_PRODUCTION_LOT',
              sourceId: suffix,
              stockQty: 2,
              remainingStockQty: 2,
              valuationQty: 20,
              remainingValuationQty: 20,
              stockUnit: '根',
              valuationUnit: 'kg',
              valuationUnitCost: 10,
              stockUnitCost: 100,
              totalAmount: 200,
              remainingAmount: 200,
            },
          },
        },
      })
      const outputDrilled = await tx.material.create({
        data: {
          code: `VERIFY-LOT-DRILLED-${suffix}`,
          name: '需钻孔成品',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
          conversionRate: 1,
          stock: { create: {} },
        },
      })
      const outputDirect = await tx.material.create({
        data: {
          code: `VERIFY-LOT-DIRECT-${suffix}`,
          name: '免钻孔成品',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
          conversionRate: 1,
          stock: { create: {} },
        },
      })
      const entity = await tx.profileStockEntity.create({
        data: {
          entityNo: `VERIFY-LOT-PF-${suffix}`,
          materialId: rawMaterial.id,
          entityType: 'BATCH',
          actualLengthMm: 3000,
          originalLengthMm: 3000,
          quantity: 2,
          availableQty: 2,
          totalWeightKg: 20,
          unitWeightKg: 10,
          status: 'AVAILABLE',
          sourceType: 'VERIFY_PRODUCTION_LOT',
          sourceId: suffix,
          reusable: true,
        },
      })
      await tx.manufacturingConfig.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          kerfMm: 0,
          headTrimMm: 0,
          tailTrimMm: 0,
          clampDeadZoneMm: 0,
          minReusableRemnantLengthMm: 500,
          allowMixedOrders: false,
          allowNegativeStock: false,
        },
        update: {
          kerfMm: 0,
          headTrimMm: 0,
          tailTrimMm: 0,
          clampDeadZoneMm: 0,
          minReusableRemnantLengthMm: 500,
          allowMixedOrders: false,
          allowNegativeStock: false,
        },
      })

      const drilledOrder = await createProductAndOrder(tx, {
        suffix,
        key: 'A',
        rawMaterialId: rawMaterial.id,
        outputMaterialId: outputDrilled.id,
        sawingTemplateId: sawingTemplate.id,
        sawingTemplateCode: sawingTemplate.code,
        drillingTemplateId: drillingTemplate.id,
        drillingTemplateCode: drillingTemplate.code,
      })
      assert(
        drilledOrder.snapshots.processSnapshot?.steps.some((step) => step.templateCategory === 'DRILLING'),
        '钻孔工艺类别必须冻结到工单快照',
      )
      const directOrder = await createProductAndOrder(tx, {
        suffix,
        key: 'B',
        rawMaterialId: rawMaterial.id,
        outputMaterialId: outputDirect.id,
        sawingTemplateId: sawingTemplate.id,
        sawingTemplateCode: sawingTemplate.code,
      })

      const drilled = await cutOrder(tx, {
        suffix,
        key: 'A',
        orderId: drilledOrder.order.id,
        entityId: entity.id,
      })
      assert(drilled.lot.requiresDrilling, '包含钻孔工艺的生产批次必须进入待钻孔')
      assert(drilled.lot.pendingDrillingQty === 2 && drilled.lot.pendingQcQty === 0, '需钻孔批次初始数量分桶不正确')
      assert(drilled.lot.materialCostAmount === 100 && drilled.lot.unitMaterialCost === 50, '生产批次未按锯切净材料成本建账')

      let directQualityBlocked = false
      try {
        await recordQualityInspection(tx, {
          productionLotId: drilled.lot.id,
          clientRequestId: `verify-lot-a-early-qc-${suffix}`,
          sourceBucket: 'QC_PENDING',
          inputQty: 1,
          sampleQty: 1,
          passedQty: 1,
          reworkQty: 0,
          scrapQty: 0,
          actor: { name: '生产批次验证脚本' },
        })
      } catch (error) {
        directQualityBlocked = error instanceof Error && error.message.includes('可检数量')
      }
      assert(directQualityBlocked, '需钻孔批次不能在钻孔前直接质检')

      await reportDrilling(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-drill-initial-${suffix}`,
        operationType: 'INITIAL',
        inputQty: 2,
        goodQty: 1,
        reworkQty: 1,
        scrapQty: 0,
        holeType: 'Φ5 通孔',
        drawingNo: 'DWG-VERIFY-A',
        actor: { name: '生产批次验证脚本' },
      })
      const firstDrilling = await tx.productionLot.findUniqueOrThrow({ where: { id: drilled.lot.id } })
      assert(firstDrilling.pendingDrillingQty === 0 && firstDrilling.pendingQcQty === 1 && firstDrilling.reworkQty === 1, '钻孔初次报工分桶不正确')
      await reportDrilling(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-drill-rework-${suffix}`,
        operationType: 'REWORK',
        inputQty: 1,
        goodQty: 1,
        reworkQty: 0,
        scrapQty: 0,
        actor: { name: '生产批次验证脚本' },
      })
      const firstQuality = await recordQualityInspection(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-quality-initial-${suffix}`,
        sourceBucket: 'QC_PENDING',
        inputQty: 2,
        sampleQty: 2,
        passedQty: 1,
        reworkQty: 1,
        scrapQty: 0,
        badReason: '一件孔位复检',
        actor: { name: '生产批次验证脚本' },
      })
      assert(firstQuality.result === 'PARTIAL', '部分合格质检结果应为 PARTIAL')
      const qcReworkDrilling = await reportDrilling(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-drill-qc-rework-${suffix}`,
        operationType: 'REWORK',
        inputQty: 1,
        goodQty: 1,
        reworkQty: 0,
        scrapQty: 0,
        actor: { name: '生产批次验证脚本' },
      })
      const finalQuality = await recordQualityInspection(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-quality-final-${suffix}`,
        sourceBucket: 'QC_PENDING',
        inputQty: 1,
        sampleQty: 1,
        passedQty: 1,
        reworkQty: 0,
        scrapQty: 0,
        actor: { name: '生产批次验证脚本' },
      })
      const passedLot = await tx.productionLot.findUniqueOrThrow({ where: { id: drilled.lot.id } })
      assert(passedLot.passedQty === 2 && passedLot.status === 'WAITING_STOCK_IN', '钻孔返工与复检后应有两件待入库合格品')

      const partialStockIn = await stockInProductionLot(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-stock-partial-${suffix}`,
        qty: 1,
        batchNo: 'VERIFY-A-01',
        actor: { name: '生产批次验证脚本' },
      })
      const drilledStockAfterPartial = await tx.stock.findUniqueOrThrow({ where: { materialId: outputDrilled.id } })
      assert(drilledStockAfterPartial.qty === 1 && drilledStockAfterPartial.totalCost === 50, '部分成品入库数量或成本不正确')
      await reverseProductionLotStockIn(tx, {
        stockInId: partialStockIn.id,
        productionLotId: drilled.lot.id,
        reason: '验证部分入库冲销',
        actor: { name: '生产批次验证脚本' },
      })
      const drilledStockAfterReverse = await tx.stock.findUniqueOrThrow({ where: { materialId: outputDrilled.id } })
      assert(drilledStockAfterReverse.qty === 0 && drilledStockAfterReverse.totalCost === 0, '成品入库冲销未恢复库存和成本')

      const fullStockIn = await stockInProductionLot(tx, {
        productionLotId: drilled.lot.id,
        clientRequestId: `verify-lot-a-stock-full-${suffix}`,
        qty: 2,
        batchNo: 'VERIFY-A-02',
        actor: { name: '生产批次验证脚本' },
      })
      let reverseQualityBlocked = false
      try {
        await reverseQualityInspection(tx, {
          inspectionId: finalQuality.id,
          productionLotId: drilled.lot.id,
          reason: '验证越级冲销',
          actor: { name: '生产批次验证脚本' },
        })
      } catch (error) {
        reverseQualityBlocked = error instanceof Error && error.message.includes('倒序冲销')
      }
      assert(reverseQualityBlocked, '已有成品入库时不得越级冲销质检')
      await reverseProductionLotStockIn(tx, {
        stockInId: fullStockIn.id,
        productionLotId: drilled.lot.id,
        reason: '验证倒序冲销',
        actor: { name: '生产批次验证脚本' },
      })
      await reverseQualityInspection(tx, {
        inspectionId: finalQuality.id,
        productionLotId: drilled.lot.id,
        reason: '验证倒序冲销',
        actor: { name: '生产批次验证脚本' },
      })
      await reverseDrillingReport(tx, {
        reportId: qcReworkDrilling.id,
        productionLotId: drilled.lot.id,
        reason: '验证倒序冲销',
        actor: { name: '生产批次验证脚本' },
      })
      const afterDownstreamReverse = await tx.productionLot.findUniqueOrThrow({ where: { id: drilled.lot.id } })
      assert(afterDownstreamReverse.passedQty === 1 && afterDownstreamReverse.reworkQty === 1, '倒序冲销未恢复质检返工状态')

      let cuttingReverseBlocked = false
      try {
        await reverseCuttingTask(tx, {
          taskId: drilled.task.id,
          reason: '验证下游阻断',
          actor: { name: '生产批次验证脚本' },
        })
      } catch (error) {
        cuttingReverseBlocked = error instanceof Error && error.message.includes('已进入钻孔')
      }
      assert(cuttingReverseBlocked, '生产批次已有下游实绩时必须阻止锯切冲销')

      const direct = await cutOrder(tx, {
        suffix,
        key: 'B',
        orderId: directOrder.order.id,
        entityId: entity.id,
      })
      assert(!direct.lot.requiresDrilling, '无钻孔工艺的生产批次不应生成钻孔操作')
      assert(direct.lot.pendingDrillingQty === 0 && direct.lot.pendingQcQty === 2, '无钻孔批次必须直接进入待质检')
      let drillingBlocked = false
      try {
        await reportDrilling(tx, {
          productionLotId: direct.lot.id,
          clientRequestId: `verify-lot-b-invalid-drill-${suffix}`,
          operationType: 'INITIAL',
          inputQty: 1,
          goodQty: 1,
          reworkQty: 0,
          scrapQty: 0,
          actor: { name: '生产批次验证脚本' },
        })
      } catch (error) {
        drillingBlocked = error instanceof Error && error.message.includes('不需要钻孔')
      }
      assert(drillingBlocked, '无钻孔批次必须拒绝钻孔报工')
      await recordQualityInspection(tx, {
        productionLotId: direct.lot.id,
        clientRequestId: `verify-lot-b-quality-${suffix}`,
        sourceBucket: 'QC_PENDING',
        inputQty: 2,
        sampleQty: 2,
        passedQty: 2,
        reworkQty: 0,
        scrapQty: 0,
        actor: { name: '生产批次验证脚本' },
      })
      await stockInProductionLot(tx, {
        productionLotId: direct.lot.id,
        clientRequestId: `verify-lot-b-stock-${suffix}`,
        qty: 2,
        batchNo: 'VERIFY-B-01',
        actor: { name: '生产批次验证脚本' },
      })
      const directStock = await tx.stock.findUniqueOrThrow({ where: { materialId: outputDirect.id } })
      const directLotFinal = await tx.productionLot.findUniqueOrThrow({ where: { id: direct.lot.id } })
      const directOrderFinal = await tx.productionOrder.findUniqueOrThrow({ where: { id: directOrder.order.id } })
      assert(directStock.qty === 2 && directStock.totalCost === 100, '无钻孔批次质检入库数量或成本不正确')
      assert(directLotFinal.status === 'COMPLETED' && directLotFinal.stockedQty === 2, '无钻孔批次未完成闭环')
      assert(directOrderFinal.status === 'COMPLETED' && directOrderFinal.completeQty === 2, '生产批次完成后工单状态未同步')

      const invariantLots = await tx.productionLot.findMany({ where: { id: { in: [drilled.lot.id, direct.lot.id] } } })
      for (const lot of invariantLots) {
        const accounted = lot.pendingDrillingQty + lot.pendingQcQty + lot.reworkQty + lot.passedQty + lot.scrappedQty
        assert(accounted === lot.cutGoodQty, `生产批次 ${lot.lotNo} 数量分桶不平衡`)
        assert(lot.stockedQty <= lot.passedQty, `生产批次 ${lot.lotNo} 入库数量超过质检合格`)
      }

      throw new Error(rollbackMarker)
    })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error
  }
  console.log('Production lot flow verified: optional drilling, rework, quality, finished-goods stock-in/cost, guarded reversal, direct-QC path, and trace buckets passed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
