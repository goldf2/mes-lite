import { PrismaClient } from '@prisma/client'
import {
  calculateCuttingPlanFromDatabase,
  cancelCuttingPlan,
  confirmCuttingPlan,
  generateCuttingDemandsForOrder,
  loadProductionOrderSnapshots,
} from '../lib/cutting'

const prisma = new PrismaClient()
const rollbackMarker = 'VERIFY_CUTTING_PLANNING_ROLLBACK'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const rawMaterial = await tx.material.create({
        data: {
          code: `VERIFY-CUT-RAW-${suffix}`,
          name: '排样验证原料',
          spec: '6063-T5',
          category: 'RAW',
          unit: '根',
          stockUnit: '根',
          valuationUnit: 'kg',
          conversionRate: 10,
          stock: { create: { qty: 2, availableQty: 2, valuationQty: 20, availableValuationQty: 20 } },
          profileSpec: { create: { sectionDescription: '验证截面', trackingMode: 'BATCH' } },
        },
      })
      const outputMaterial = await tx.material.create({
        data: {
          code: `VERIFY-CUT-OUT-${suffix}`,
          name: '排样验证成品',
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
          sku: `VERIFY-CUT-P-${suffix}`,
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
                  cutTolerancePlusMm: 0.5,
                  cutToleranceMinusMm: 0.5,
                },
              },
            },
          },
          processRoutes: {
            create: {
              name: '排样验证工艺',
              isDefault: true,
              steps: { create: { stepNo: 10, name: '锯切', templateCode: 'SAWING' } },
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
          allowMixedOrders: false,
          allowNegativeStock: false,
        },
        update: {
          kerfMm: 3,
          headTrimMm: 10,
          tailTrimMm: 10,
          clampDeadZoneMm: 20,
          allowMixedOrders: false,
        },
      })
      const snapshots = await loadProductionOrderSnapshots(tx, product.id)
      assert(snapshots.bomSnapshot, '未生成 BOM 快照')
      assert(snapshots.processSnapshot?.steps[0]?.name === '锯切', '未生成工艺快照')

      const order = await tx.productionOrder.create({
        data: {
          orderNo: `VERIFY-CUT-WO-${suffix}`,
          productId: product.id,
          materialId: outputMaterial.id,
          planQty: 10,
          status: 'CONFIRMED',
          bomVersionSnapshot: snapshots.bomSnapshot.version,
          bomSnapshot: JSON.stringify(snapshots.bomSnapshot),
          processSnapshot: JSON.stringify(snapshots.processSnapshot),
          snapshotCreatedAt: new Date(),
        },
      })
      const generated = await generateCuttingDemandsForOrder(tx, order.id)
      assert(generated.createdCount === 1 && generated.demands.length === 1, '工单应生成一条切割需求')
      const repeated = await generateCuttingDemandsForOrder(tx, order.id)
      assert(repeated.createdCount === 0 && repeated.demands[0]?.id === generated.demands[0]?.id, '重复生成必须保持幂等')
      const demand = generated.demands[0]
      assert(demand.requiredQty === 10 && demand.pieceLengthMm === 1000, '切割需求快照数量或切长不正确')
      assert(demand.kerfMm === 3 && demand.headTrimMm === 10, '制造参数未冻结到需求')

      const entity = await tx.profileStockEntity.create({
        data: {
          entityNo: `VERIFY-CUT-PF-${suffix}`,
          materialId: rawMaterial.id,
          entityType: 'BATCH',
          actualLengthMm: 6000,
          originalLengthMm: 6000,
          quantity: 2,
          availableQty: 2,
          totalWeightKg: 20,
          unitWeightKg: 10,
          status: 'AVAILABLE',
          sourceType: 'VERIFY',
          sourceId: suffix,
          reusable: true,
        },
      })
      const calculationInput = {
        demandLines: [{ demandId: demand.id, requestedQty: 10 }],
        sources: [{ entityId: entity.id, selectedQty: 2 }],
      }
      const calculated = await calculateCuttingPlanFromDatabase(tx, calculationInput)
      assert(calculated.calculation.totals.plannedQty === 10, '两根 6000mm 型材应排出 10 件 1000mm 成品')
      assert(calculated.calculation.totals.sourceQty === 2, '排样应占用两根原料')
      assert(calculated.calculation.sources.every((item) => item.expectedRemnantLengthMm === 945), '预计单根余料应为 945mm')

      const plan = await confirmCuttingPlan(tx, {
        ...calculationInput,
        clientRequestId: `verify-cut-plan-${suffix}`,
      }, { name: '排样验证脚本' })
      assert(plan.totalPlannedQty === 10 && plan.sources.length === 2, '确认排样的来源明细不正确')
      const entityAfterConfirm = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: entity.id } })
      assert(entityAfterConfirm.availableQty === 0 && entityAfterConfirm.reservedQty === 2 && entityAfterConfirm.status === 'RESERVED', '确认排样未正确占用实体')
      const repeatedPlan = await confirmCuttingPlan(tx, {
        ...calculationInput,
        clientRequestId: `verify-cut-plan-${suffix}`,
      }, { name: '排样验证脚本' })
      assert(repeatedPlan.id === plan.id, '重复确认排样必须返回同一方案')
      const entityAfterRepeat = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: entity.id } })
      assert(entityAfterRepeat.reservedQty === 2, '幂等重试不能重复占用实体')

      await cancelCuttingPlan(tx, {
        planId: plan.id,
        reason: '验证取消恢复',
        actor: { name: '排样验证脚本' },
      })
      const entityAfterCancel = await tx.profileStockEntity.findUniqueOrThrow({ where: { id: entity.id } })
      const demandAfterCancel = await tx.cuttingDemand.findUniqueOrThrow({ where: { id: demand.id } })
      assert(entityAfterCancel.availableQty === 2 && entityAfterCancel.reservedQty === 0 && entityAfterCancel.status === 'AVAILABLE', '取消排样未释放实体')
      assert(demandAfterCancel.plannedQty === 0 && demandAfterCancel.status === 'OPEN', '取消排样未恢复需求')

      const secondOrder = await tx.productionOrder.create({
        data: {
          orderNo: `VERIFY-CUT-WO2-${suffix}`,
          productId: product.id,
          materialId: outputMaterial.id,
          planQty: 2,
          status: 'CONFIRMED',
          bomVersionSnapshot: snapshots.bomSnapshot.version,
          bomSnapshot: JSON.stringify(snapshots.bomSnapshot),
          processSnapshot: JSON.stringify(snapshots.processSnapshot),
          snapshotCreatedAt: new Date(),
        },
      })
      const secondDemand = (await generateCuttingDemandsForOrder(tx, secondOrder.id)).demands[0]
      let mixedBlocked = false
      try {
        await calculateCuttingPlanFromDatabase(tx, {
          demandLines: [
            { demandId: demand.id, requestedQty: 1 },
            { demandId: secondDemand.id, requestedQty: 1 },
          ],
          sources: [{ entityId: entity.id, selectedQty: 1 }],
        })
      } catch (error) {
        mixedBlocked = error instanceof Error && error.message.includes('尚未允许')
      }
      assert(mixedBlocked, '禁止混单时不能在同一根型材排两个工单')
      await tx.manufacturingConfig.update({ where: { id: 'default' }, data: { allowMixedOrders: true } })
      const mixed = await calculateCuttingPlanFromDatabase(tx, {
        demandLines: [
          { demandId: demand.id, requestedQty: 1 },
          { demandId: secondDemand.id, requestedQty: 1 },
        ],
        sources: [{ entityId: entity.id, selectedQty: 1 }],
      })
      assert(mixed.calculation.totals.plannedQty === 2 && mixed.calculation.sources[0]?.cuts.length === 2, '允许混单时应在同一根保存两个需求切件明细')

      const movementTypes = await tx.profileStockMovement.findMany({
        where: { entityId: entity.id },
        select: { movementType: true },
      })
      assert(movementTypes.some((item) => item.movementType === 'RESERVE_FOR_CUTTING'), '缺少排样占用审计流水')
      assert(movementTypes.some((item) => item.movementType === 'RELEASE_CUTTING_RESERVATION'), '缺少排样取消审计流水')

      throw new Error(rollbackMarker)
    })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error
  }
  console.log('Cutting planning flow verified: snapshots, demand idempotency, manual calculation, reservation, cancellation, and mixed-order policy passed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
