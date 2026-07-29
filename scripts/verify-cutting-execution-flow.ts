import { PrismaClient } from '@prisma/client'
import {
  cancelCuttingPlan,
  confirmCuttingPlan,
  generateCuttingDemandsForOrder,
  loadProductionOrderSnapshots,
  usesProfileEntityCutting,
} from '../lib/cutting'
import {
  completeCuttingTask,
  releaseCuttingTask,
  reverseCuttingTask,
  startCuttingTask,
} from '../lib/cutting-execution'

const prisma = new PrismaClient()
const rollbackMarker = 'VERIFY_CUTTING_EXECUTION_ROLLBACK'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function closeEnough(actual: number, expected: number, tolerance = 0.000001) {
  return Math.abs(actual - expected) <= tolerance
}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const rawMaterial = await tx.material.create({
        data: {
          code: `VERIFY-EXEC-RAW-${suffix}`,
          name: '锯切执行验证原料',
          spec: '6063-T5',
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
          profileSpec: { create: { sectionDescription: '锯切执行验证截面', trackingMode: 'BATCH' } },
          costLayers: {
            create: {
              sourceType: 'VERIFY',
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
      const outputMaterial = await tx.material.create({
        data: {
          code: `VERIFY-EXEC-OUT-${suffix}`,
          name: '锯切执行验证成品',
          category: 'FINISHED',
          unit: '件',
          stockUnit: '件',
          valuationUnit: '件',
          conversionRate: 1,
          stock: { create: {} },
        },
      })
      const product = await tx.product.create({
        data: {
          sku: `VERIFY-EXEC-P-${suffix}`,
          name: outputMaterial.name,
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
                  materialId: rawMaterial.id,
                  quantity: 1,
                  unit: '根',
                  wastageRate: 0,
                  cutLengthMm: 1000,
                },
              },
            },
          },
        },
      })
      await tx.manufacturingConfig.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          kerfMm: 3,
          headTrimMm: 10,
          tailTrimMm: 10,
          clampDeadZoneMm: 20,
          minReusableRemnantLengthMm: 500,
          allowMixedOrders: false,
          allowNegativeStock: false,
        },
        update: {
          kerfMm: 3,
          headTrimMm: 10,
          tailTrimMm: 10,
          clampDeadZoneMm: 20,
          minReusableRemnantLengthMm: 500,
          allowMixedOrders: false,
          allowNegativeStock: false,
        },
      })
      const snapshots = await loadProductionOrderSnapshots(tx, product.id)
      const bomItem = snapshots.bom?.items[0]
      assert(bomItem && usesProfileEntityCutting(bomItem), '带切长的实体追踪型材必须跳过传统工单领料预留')
      assert(snapshots.bomSnapshot, '未生成 BOM 快照')
      const order = await tx.productionOrder.create({
        data: {
          orderNo: `VERIFY-EXEC-WO-${suffix}`,
          productId: product.id,
          materialId: outputMaterial.id,
          planQty: 10,
          status: 'CONFIRMED',
          bomVersionSnapshot: snapshots.bomSnapshot.version,
          bomSnapshot: JSON.stringify(snapshots.bomSnapshot),
          snapshotCreatedAt: new Date(),
        },
      })
      const demand = (await generateCuttingDemandsForOrder(tx, order.id)).demands[0]
      const entity = await tx.profileStockEntity.create({
        data: {
          entityNo: `VERIFY-EXEC-PF-${suffix}`,
          materialId: rawMaterial.id,
          entityType: 'BATCH',
          actualLengthMm: 6000,
          originalLengthMm: 6000,
          quantity: 2,
          availableQty: 2,
          totalWeightKg: 20,
          unitWeightKg: 10,
          location: '验证库位',
          status: 'AVAILABLE',
          sourceType: 'VERIFY',
          sourceId: suffix,
          reusable: true,
        },
      })
      const plan = await confirmCuttingPlan(tx, {
        clientRequestId: `verify-exec-plan-${suffix}`,
        demandLines: [{ demandId: demand.id, requestedQty: 10 }],
        sources: [{ entityId: entity.id, selectedQty: 2 }],
      }, { name: '锯切执行验证脚本' })
      const stockAfterPlan = await tx.stock.findUniqueOrThrow({ where: { materialId: rawMaterial.id } })
      assert(stockAfterPlan.availableQty === 0 && stockAfterPlan.reservedQty === 2, '排样确认必须按实际两根原料预留汇总库存')
      assert(stockAfterPlan.availableValuationQty === 0 && stockAfterPlan.reservedValuationQty === 20, '排样确认必须同步预留核算库存')
      assert(Number(plan.reservedStockQty) === 2 && Number(plan.reservedValuationQty) === 20, '排样方案未保存总账预留快照')

      const task = await releaseCuttingTask(tx, {
        cuttingPlanId: plan.id,
        clientRequestId: `verify-exec-task-${suffix}`,
        device: '验证锯床',
        shift: '白班',
      })
      const repeatedTask = await releaseCuttingTask(tx, {
        cuttingPlanId: plan.id,
        clientRequestId: `verify-exec-task-${suffix}`,
      })
      assert(repeatedTask.id === task.id, '重复下发必须返回同一锯切任务')
      await startCuttingTask(tx, { taskId: task.id, actor: { name: '锯切执行验证脚本' } })

      const freshPlan = await tx.cuttingPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: {
          sources: {
            include: {
              cuts: { include: { planDemand: true } },
            },
            orderBy: { sourceUnitIndex: 'asc' },
          },
        },
      })
      assert(freshPlan.sources.length === 2, '验证方案应包含两根原料')
      const completion = {
        clientRequestId: `verify-exec-complete-${suffix}`,
        sources: freshPlan.sources.map((source, index) => ({
          planSourceId: source.id,
          actualSourceLengthMm: 6000,
          actualRemainingLengthMm: index === 0 ? 945 : 400,
          actualKerfLossMm: source.kerfLossMm,
          actualFixedLossMm: source.fixedLossMm,
          actualOtherLossMm: index === 0 ? 0 : 545,
          disposition: index === 0 ? 'REUSABLE_REMNANT' as const : 'SCRAP' as const,
          outputs: source.cuts.map((cut) => ({
            cuttingDemandId: cut.planDemand.demandId,
            goodQty: index === 0 ? cut.plannedQty : cut.plannedQty - 1,
            badQty: index === 0 ? 0 : 1,
            scrapQty: 0,
            badReason: index === 0 ? null : '验证不良',
          })),
        })),
      }
      const completedTask = await completeCuttingTask(tx, {
        taskId: task.id,
        completion,
        actor: { name: '锯切执行验证脚本' },
      })
      const repeatedCompletion = await completeCuttingTask(tx, {
        taskId: task.id,
        completion,
        actor: { name: '锯切执行验证脚本' },
      })
      assert(repeatedCompletion.id === completedTask.id, '重复完工请求必须保持幂等')
      assert(completedTask.status === 'COMPLETED' && completedTask.sources.length === 2, '锯切任务未正确完工')
      assert(completedTask.sources.filter((item) => item.remnantEntity).length === 1, '只有达到阈值且选择回库的剩余料应生成余料实体')

      const entityAfterCompletion = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: entity.id } })
      assert(entityAfterCompletion.availableQty === 0 && entityAfterCompletion.reservedQty === 0, '完工后来源实体不能继续保持可用或占用')
      assert(entityAfterCompletion.consumedQty === 2 && entityAfterCompletion.status === 'CONSUMED', '完工后两根来源实体应转为已耗用')
      const remnant = await tx.profileStockEntity.findFirstOrThrow({
        where: { sourceType: 'CUTTING_TASK', sourceId: task.id, isRemnant: true },
      })
      assert(remnant.parentEntityId === entity.id && remnant.actualLengthMm === 945, '余料实体未保存来源谱系或实绩长度')
      assert(remnant.status === 'REMNANT' && remnant.availableQty === 1, '可复用余料未正确入实体库存')
      const stockAfterCompletion = await tx.stock.findUniqueOrThrow({ where: { materialId: rawMaterial.id } })
      assert(stockAfterCompletion.qty === 1 && stockAfterCompletion.availableQty === 1 && stockAfterCompletion.reservedQty === 0, '原料耗用和余料回库后的汇总数量不正确')
      assert(closeEnough(stockAfterCompletion.valuationQty, 1.575), '余料核算数量应按剩余长度比例回收')
      assert(closeEnough(stockAfterCompletion.totalCost, 15.75), '余料成本应按剩余长度比例回收')
      const demandAfterCompletion = await tx.cuttingDemand.findUniqueOrThrow({ where: { id: demand.id } })
      assert(demandAfterCompletion.completedQty === 9, '需求完成量只能累计合格数量')
      const originalLayer = await tx.inventoryCostLayer.findFirstOrThrow({
        where: { materialId: rawMaterial.id, sourceType: 'VERIFY', sourceId: suffix },
      })
      assert(originalLayer.status === 'CLOSED' && originalLayer.remainingStockQty === 0, 'FIFO 原料成本层未被完整耗用')
      const remnantLayer = await tx.inventoryCostLayer.findFirstOrThrow({
        where: { materialId: rawMaterial.id, sourceType: 'CUTTING_TASK_REMNANT' },
      })
      assert(remnantLayer.status === 'OPEN' && remnantLayer.remainingStockQty === 1, '余料回库未建立独立成本层')

      const reversedTask = await reverseCuttingTask(tx, {
        taskId: task.id,
        reason: '验证完整冲销',
        actor: { name: '锯切执行验证脚本' },
      })
      const repeatedReversal = await reverseCuttingTask(tx, {
        taskId: task.id,
        reason: '验证完整冲销',
        actor: { name: '锯切执行验证脚本' },
      })
      assert(reversedTask.status === 'REVERSED' && repeatedReversal.id === reversedTask.id, '锯切冲销必须成功且幂等')
      const entityAfterReversal = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: entity.id } })
      assert(entityAfterReversal.reservedQty === 2 && entityAfterReversal.consumedQty === 0 && entityAfterReversal.status === 'RESERVED', '冲销未恢复来源实体占用')
      const remnantAfterReversal = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: remnant.id } })
      assert(remnantAfterReversal.availableQty === 0 && remnantAfterReversal.status === 'REVERSED', '冲销未作废余料实体')
      const stockAfterReversal = await tx.stock.findUniqueOrThrow({ where: { materialId: rawMaterial.id } })
      assert(stockAfterReversal.qty === 2 && stockAfterReversal.reservedQty === 2 && stockAfterReversal.availableQty === 0, '冲销未恢复汇总库存预留')
      assert(closeEnough(stockAfterReversal.valuationQty, 20) && closeEnough(stockAfterReversal.totalCost, 200), '冲销未恢复汇总核算库存与成本')
      const restoredOriginalLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: originalLayer.id } })
      const reversedRemnantLayer = await tx.inventoryCostLayer.findUniqueOrThrow({ where: { id: remnantLayer.id } })
      assert(restoredOriginalLayer.status === 'OPEN' && restoredOriginalLayer.remainingStockQty === 2, '冲销未恢复 FIFO 原料成本层')
      assert(reversedRemnantLayer.status === 'REVERSED' && reversedRemnantLayer.remainingStockQty === 0, '冲销未作废余料成本层')
      const demandAfterReversal = await tx.cuttingDemand.findUniqueOrThrow({ where: { id: demand.id } })
      assert(demandAfterReversal.completedQty === 0 && demandAfterReversal.plannedQty === 10, '冲销未恢复切割需求完成量')

      await cancelCuttingPlan(tx, {
        planId: plan.id,
        reason: '验证冲销后取消方案',
        actor: { name: '锯切执行验证脚本' },
      })
      const stockAfterCancel = await tx.stock.findUniqueOrThrow({ where: { materialId: rawMaterial.id } })
      const entityAfterCancel = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: entity.id } })
      const demandAfterCancel = await tx.cuttingDemand.findUniqueOrThrow({ where: { id: demand.id } })
      assert(stockAfterCancel.qty === 2 && stockAfterCancel.availableQty === 2 && stockAfterCancel.reservedQty === 0, '冲销后取消排样未释放汇总库存')
      assert(entityAfterCancel.availableQty === 2 && entityAfterCancel.reservedQty === 0 && entityAfterCancel.status === 'AVAILABLE', '冲销后取消排样未释放实体')
      assert(demandAfterCancel.plannedQty === 0 && demandAfterCancel.status === 'OPEN', '冲销后取消排样未恢复切割需求')

      const movementTypes = await tx.profileStockMovement.findMany({
        where: { OR: [{ entityId: entity.id }, { entityId: remnant.id }] },
        select: { movementType: true },
      })
      for (const expected of ['RESERVE_FOR_CUTTING', 'CONSUME_FOR_CUTTING', 'REMNANT_IN', 'REMNANT_REVERSAL', 'RESTORE_CUTTING_CONSUMPTION', 'RELEASE_CUTTING_RESERVATION']) {
        assert(movementTypes.some((item) => item.movementType === expected), `缺少实体审计流水 ${expected}`)
      }
      const stockLogTypes = await tx.stockLog.findMany({
        where: { stockId: stockAfterCancel.id },
        select: { type: true },
      })
      for (const expected of ['CUTTING_RESERVE', 'CUTTING_ISSUE', 'CUTTING_REMNANT_IN', 'CUTTING_REMNANT_REVERSAL', 'CUTTING_ISSUE_REVERSAL', 'CUTTING_RESERVATION_RELEASE']) {
        assert(stockLogTypes.some((item) => item.type === expected), `缺少库存总账流水 ${expected}`)
      }

      throw new Error(rollbackMarker)
    })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error
  }
  console.log('Cutting execution flow verified: ledger reservation, task release/start, actual completion, remnant lineage/cost, FIFO issue, reversal, and cancellation passed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
