import { Prisma } from '@prisma/client'
import {
  releaseCuttingInventoryReservation,
  reserveCuttingInventory,
} from './cutting-inventory'

export type CuttingRules = {
  kerfMm: number
  headTrimMm: number
  tailTrimMm: number
  clampDeadZoneMm: number
}

export type CuttingCalculationDemand = {
  demandId: string
  mixKey: string
  rawMaterialId: string
  pieceLengthMm: number
  requestedQty: number
}

export type CuttingCalculationSource = {
  entityId: string
  entityNo: string
  materialId: string
  sourceLengthMm: number
  availableQty: number
  selectedQty: number
}

export type CuttingSourceCutResult = {
  demandId: string
  sequence: number
  pieceLengthMm: number
  plannedQty: number
  productLengthMm: number
  kerfLossMm: number
}

export type CuttingSourceResult = {
  entityId: string
  entityNo: string
  sourceUnitIndex: number
  sourceLengthMm: number
  plannedCutQty: number
  productLengthMm: number
  kerfLossMm: number
  fixedLossMm: number
  expectedRemnantLengthMm: number
  utilizationRate: number
  cuts: CuttingSourceCutResult[]
}

export type CuttingCalculationResult = {
  demands: Array<{
    demandId: string
    requestedQty: number
    plannedQty: number
    shortageQty: number
  }>
  sources: CuttingSourceResult[]
  unusedSourceQty: number
  rules: CuttingRules
  totals: {
    plannedQty: number
    sourceQty: number
    sourceLengthMm: number
    productLengthMm: number
    kerfLossMm: number
    fixedLossMm: number
    expectedRemnantLengthMm: number
    utilizationRate: number
  }
}

export type ProductionOrderBomSnapshot = {
  id: string
  version: string
  isActive: boolean
  outputQuantity: number
  outputUnit: string
  items: Array<{
    id: string
    itemType: string
    materialId: string | null
    quantity: number
    unit: string
    wastageRate: number
    cutLengthMm: number | null
    cutTolerancePlusMm: number | null
    cutToleranceMinusMm: number | null
    material: {
      id: string
      code: string
      name: string
      spec: string | null
      stockUnit: string
      valuationUnit: string
    } | null
  }>
}

export type ProductionOrderProcessSnapshot = {
  id: string
  name: string
  steps: Array<{
    id: string
    stepNo: number
    name: string
    workstation: string | null
    description: string | null
    templateId: string | null
    templateCode: string | null
    templateCategory: string | null
    standardBatchQty: number
    setupTimeMinutes: number
    cycleTimeSeconds: number
  }>
}

const roundLength = (value: number) => Number(value.toFixed(6))

export function usesProfileEntityCutting(item: {
  cutLengthMm?: number | null
  material?: { profileSpec?: { id: string } | null } | null
}) {
  return Number(item.cutLengthMm || 0) > 0 && Boolean(item.material?.profileSpec)
}

function nonnegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}必须为非负数`)
  return value
}

export function calculateCuttingPlan(input: {
  demands: CuttingCalculationDemand[]
  sources: CuttingCalculationSource[]
  rules: CuttingRules
  allowMixedOrders: boolean
}): CuttingCalculationResult {
  if (input.demands.length === 0) throw new Error('至少选择一条切割需求')
  if (input.sources.length === 0) throw new Error('至少选择一个可用原料实体')

  const rules = {
    kerfMm: nonnegativeFinite(Number(input.rules.kerfMm), '锯缝'),
    headTrimMm: nonnegativeFinite(Number(input.rules.headTrimMm), '首端切除量'),
    tailTrimMm: nonnegativeFinite(Number(input.rules.tailTrimMm), '尾端切除量'),
    clampDeadZoneMm: nonnegativeFinite(Number(input.rules.clampDeadZoneMm), '夹持死区'),
  }
  const fixedLossPerSource = rules.headTrimMm + rules.tailTrimMm + rules.clampDeadZoneMm

  const rawMaterialIds = new Set(input.demands.map((item) => item.rawMaterialId))
  if (rawMaterialIds.size !== 1) throw new Error('同一排样方案只能使用同一种型材规格')
  const rawMaterialId = input.demands[0].rawMaterialId
  const mixKeys = new Set(input.demands.map((item) => item.mixKey))
  if (mixKeys.size > 1 && !input.allowMixedOrders) {
    throw new Error('制造参数尚未允许同一根型材混合多个订单或产品')
  }

  const demandState = input.demands.map((item) => {
    const requestedQty = Number(item.requestedQty)
    const pieceLengthMm = Number(item.pieceLengthMm)
    if (!Number.isInteger(requestedQty) || requestedQty <= 0) throw new Error('排样数量必须为正整数')
    if (!Number.isFinite(pieceLengthMm) || pieceLengthMm <= 0) throw new Error('成品切长必须大于 0')
    return { ...item, requestedQty, pieceLengthMm, remainingQty: requestedQty, plannedQty: 0 }
  })

  const sourceById = new Map<string, CuttingCalculationSource>()
  for (const source of input.sources) {
    const existing = sourceById.get(source.entityId)
    if (existing) {
      existing.selectedQty += Number(source.selectedQty)
      continue
    }
    sourceById.set(source.entityId, { ...source, selectedQty: Number(source.selectedQty) })
  }

  const results: CuttingSourceResult[] = []
  let unusedSourceQty = 0

  for (const source of Array.from(sourceById.values())) {
    if (source.materialId !== rawMaterialId) throw new Error(`实体 ${source.entityNo} 与需求型材规格不一致`)
    if (!Number.isInteger(source.selectedQty) || source.selectedQty <= 0) throw new Error(`实体 ${source.entityNo} 的选择根数必须为正整数`)
    if (source.selectedQty > source.availableQty) throw new Error(`实体 ${source.entityNo} 的选择根数超过当前可用数量`)
    if (!Number.isFinite(source.sourceLengthMm) || source.sourceLengthMm <= 0) throw new Error(`实体 ${source.entityNo} 的实际长度无效`)

    for (let sourceUnitIndex = 1; sourceUnitIndex <= source.selectedQty; sourceUnitIndex += 1) {
      if (demandState.every((item) => item.remainingQty === 0)) {
        unusedSourceQty += source.selectedQty - sourceUnitIndex + 1
        break
      }

      let usableLengthMm = source.sourceLengthMm - fixedLossPerSource
      const cuts: CuttingSourceCutResult[] = []
      let sequence = 1

      if (usableLengthMm > 0) {
        for (const demand of demandState) {
          if (demand.remainingQty <= 0) continue
          const occupiedPerPieceMm = demand.pieceLengthMm + rules.kerfMm
          const capacity = Math.floor((usableLengthMm + 0.0000001) / occupiedPerPieceMm)
          const plannedQty = Math.min(capacity, demand.remainingQty)
          if (plannedQty <= 0) continue

          const productLengthMm = roundLength(plannedQty * demand.pieceLengthMm)
          const kerfLossMm = roundLength(plannedQty * rules.kerfMm)
          usableLengthMm = roundLength(Math.max(0, usableLengthMm - productLengthMm - kerfLossMm))
          demand.remainingQty -= plannedQty
          demand.plannedQty += plannedQty
          cuts.push({
            demandId: demand.demandId,
            sequence,
            pieceLengthMm: demand.pieceLengthMm,
            plannedQty,
            productLengthMm,
            kerfLossMm,
          })
          sequence += 1
        }
      }

      if (cuts.length === 0) {
        unusedSourceQty += 1
        continue
      }
      const productLengthMm = roundLength(cuts.reduce((sum, item) => sum + item.productLengthMm, 0))
      const kerfLossMm = roundLength(cuts.reduce((sum, item) => sum + item.kerfLossMm, 0))
      results.push({
        entityId: source.entityId,
        entityNo: source.entityNo,
        sourceUnitIndex,
        sourceLengthMm: source.sourceLengthMm,
        plannedCutQty: cuts.reduce((sum, item) => sum + item.plannedQty, 0),
        productLengthMm,
        kerfLossMm,
        fixedLossMm: roundLength(fixedLossPerSource),
        expectedRemnantLengthMm: roundLength(usableLengthMm),
        utilizationRate: roundLength(source.sourceLengthMm > 0 ? productLengthMm / source.sourceLengthMm * 100 : 0),
        cuts,
      })
    }
  }

  const sourceLengthMm = roundLength(results.reduce((sum, item) => sum + item.sourceLengthMm, 0))
  const productLengthMm = roundLength(results.reduce((sum, item) => sum + item.productLengthMm, 0))
  const kerfLossMm = roundLength(results.reduce((sum, item) => sum + item.kerfLossMm, 0))
  const fixedLossMm = roundLength(results.reduce((sum, item) => sum + item.fixedLossMm, 0))
  const expectedRemnantLengthMm = roundLength(results.reduce((sum, item) => sum + item.expectedRemnantLengthMm, 0))

  return {
    demands: demandState.map((item) => ({
      demandId: item.demandId,
      requestedQty: item.requestedQty,
      plannedQty: item.plannedQty,
      shortageQty: item.remainingQty,
    })),
    sources: results,
    unusedSourceQty,
    rules,
    totals: {
      plannedQty: results.reduce((sum, item) => sum + item.plannedCutQty, 0),
      sourceQty: results.length,
      sourceLengthMm,
      productLengthMm,
      kerfLossMm,
      fixedLossMm,
      expectedRemnantLengthMm,
      utilizationRate: roundLength(sourceLengthMm > 0 ? productLengthMm / sourceLengthMm * 100 : 0),
    },
  }
}

export async function loadProductionOrderSnapshots(tx: Prisma.TransactionClient, productId: string) {
  const [bom, route] = await Promise.all([
    tx.bOM.findUnique({
      where: { productId },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            material: {
              select: {
                id: true,
                code: true,
                name: true,
                spec: true,
                stockUnit: true,
                valuationUnit: true,
                conversionRate: true,
                stock: true,
                profileSpec: { select: { id: true } },
              },
            },
          },
        },
      },
    }),
    tx.processRoute.findFirst({
      where: { productId, isDefault: true },
      include: { steps: { where: { deletedAt: null }, orderBy: { stepNo: 'asc' } } },
    }),
  ])
  const templateIds = route?.steps.map((step) => step.templateId).filter(Boolean) as string[] || []
  const templateCodes = route?.steps.map((step) => step.templateCode).filter(Boolean) as string[] || []
  const processTemplates = templateIds.length > 0 || templateCodes.length > 0
    ? await tx.processTemplate.findMany({
      where: {
        OR: [
          ...(templateIds.length > 0 ? [{ id: { in: templateIds } }] : []),
          ...(templateCodes.length > 0 ? [{ code: { in: templateCodes } }] : []),
        ],
      },
      select: { id: true, code: true, category: true },
    })
    : []
  const templateCategoryById = new Map(processTemplates.map((item) => [item.id, item.category]))
  const templateCategoryByCode = new Map(processTemplates.map((item) => [item.code, item.category]))

  const bomSnapshot: ProductionOrderBomSnapshot | null = bom ? {
    id: bom.id,
    version: bom.version,
    isActive: bom.isActive,
    outputQuantity: Number(bom.outputQuantity || 1),
    outputUnit: bom.outputUnit,
    items: bom.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      materialId: item.materialId,
      quantity: Number(item.quantity),
      unit: item.unit,
      wastageRate: Number(item.wastageRate),
      cutLengthMm: item.cutLengthMm === null ? null : Number(item.cutLengthMm),
      cutTolerancePlusMm: item.cutTolerancePlusMm === null ? null : Number(item.cutTolerancePlusMm),
      cutToleranceMinusMm: item.cutToleranceMinusMm === null ? null : Number(item.cutToleranceMinusMm),
      material: item.material ? {
        id: item.material.id,
        code: item.material.code,
        name: item.material.name,
        spec: item.material.spec,
        stockUnit: item.material.stockUnit,
        valuationUnit: item.material.valuationUnit,
      } : null,
    })),
  } : null

  const processSnapshot: ProductionOrderProcessSnapshot | null = route ? {
    id: route.id,
    name: route.name,
    steps: route.steps.map((step) => ({
      id: step.id,
      stepNo: step.stepNo,
      name: step.name,
      workstation: step.workstation,
      description: step.description,
      templateId: step.templateId,
      templateCode: step.templateCode,
      templateCategory: (
        (step.templateId && templateCategoryById.get(step.templateId))
        || (step.templateCode && templateCategoryByCode.get(step.templateCode))
        || null
      ),
      standardBatchQty: step.standardBatchQty,
      setupTimeMinutes: Number(step.setupTimeMinutes),
      cycleTimeSeconds: Number(step.cycleTimeSeconds),
    })),
  } : null

  return { bom, route, bomSnapshot, processSnapshot }
}

export function parseBomSnapshot(value: string | null): ProductionOrderBomSnapshot | null {
  if (!value) return null
  try {
    return JSON.parse(value) as ProductionOrderBomSnapshot
  } catch {
    throw new Error('工单 BOM 快照损坏，无法生成切割需求')
  }
}

export async function generateCuttingDemandsForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  let order = await tx.productionOrder.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
      targetMaterial: {
        select: { id: true, code: true, name: true, stockUnit: true, unit: true },
      },
    },
  })
  if (!order) throw new Error('生产工单不存在或已归档')
  if (order.status === 'CANCELLED') throw new Error('已取消工单不能生成切割需求')

  let bomSnapshot = parseBomSnapshot(order.bomSnapshot)
  if (!bomSnapshot) {
    const snapshots = await loadProductionOrderSnapshots(tx, order.productId)
    if (!snapshots.bomSnapshot) throw new Error('工单没有有效 BOM，不能生成切割需求')
    bomSnapshot = snapshots.bomSnapshot
    order = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        bomVersionSnapshot: snapshots.bomSnapshot.version,
        bomSnapshot: JSON.stringify(snapshots.bomSnapshot),
        processSnapshot: snapshots.processSnapshot ? JSON.stringify(snapshots.processSnapshot) : null,
        snapshotCreatedAt: new Date(),
      },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        targetMaterial: {
          select: { id: true, code: true, name: true, stockUnit: true, unit: true },
        },
      },
    })
  }
  if (!bomSnapshot.isActive) throw new Error('工单 BOM 快照不是生效版本')

  const materialItems = bomSnapshot.items.filter((item) => item.itemType === 'MATERIAL' && item.materialId && item.material)
  const materialIds = materialItems.map((item) => item.materialId).filter(Boolean) as string[]
  const profileSpecs = await tx.profileSpec.findMany({ where: { materialId: { in: materialIds } } })
  const trackedMaterialIds = new Set(profileSpecs.map((item) => item.materialId))
  const profileItems = materialItems.filter((item) => item.materialId && trackedMaterialIds.has(item.materialId))
  if (profileItems.length === 0) throw new Error('工单 BOM 没有启用实体追踪的型材原料')

  const config = await tx.manufacturingConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', allowNegativeStock: false },
    update: {},
  })
  const nullableRules = {
    kerfMm: config.kerfMm,
    headTrimMm: config.headTrimMm,
    tailTrimMm: config.tailTrimMm,
    clampDeadZoneMm: config.clampDeadZoneMm,
  }
  const ruleWarnings = Object.entries(nullableRules)
    .filter(([, value]) => value === null)
    .map(([key]) => `${key} 未配置，本需求快照按 0 mm 计算`)
  const effectiveRules = {
    kerfMm: Number(config.kerfMm ?? 0),
    headTrimMm: Number(config.headTrimMm ?? 0),
    tailTrimMm: Number(config.tailTrimMm ?? 0),
    clampDeadZoneMm: Number(config.clampDeadZoneMm ?? 0),
  }
  const missingCutLength = profileItems
    .filter((item) => !item.cutLengthMm || item.cutLengthMm <= 0)
    .map((item) => ({
      bomItemId: item.id,
      materialId: item.materialId as string,
      materialCode: item.material?.code || '',
      materialName: item.material?.name || '',
    }))
  const configuredItems = profileItems.filter((item) => item.cutLengthMm && item.cutLengthMm > 0)
  if (configuredItems.length === 0) {
    throw new Error(`型材 BOM 原料尚未填写成品切长：${missingCutLength.map((item) => item.materialCode).join('、')}`)
  }

  const outputCode = order.targetMaterial?.code || order.product.sku.replace(/^MAT-/, '')
  const outputName = order.targetMaterial?.name || order.product.name
  const outputUnit = order.targetMaterial?.stockUnit || order.targetMaterial?.unit || order.product.unit || '件'
  const outputBasis = Number(bomSnapshot.outputQuantity || 1)
  const demands = []
  let createdCount = 0

  for (let index = 0; index < configuredItems.length; index += 1) {
    const item = configuredItems[index]
    if (!item.materialId || !item.material || !item.cutLengthMm) continue
    const requiredQty = Math.ceil(
      Number(order.planQty)
      * Number(item.quantity)
      / outputBasis
      * (1 + Number(item.wastageRate || 0) / 100),
    )
    if (requiredQty <= 0) continue

    const sourceKey = `ORDER_BOM:${order.id}:${item.id}`
    const existing = await tx.cuttingDemand.findUnique({ where: { sourceKey } })
    if (existing) {
      demands.push(existing)
      continue
    }
    const demand = await tx.cuttingDemand.create({
      data: {
        demandNo: `CD-${order.orderNo}-${String(index + 1).padStart(3, '0')}`,
        sourceKey,
        productionOrderId: order.id,
        outputMaterialId: order.materialId,
        rawMaterialId: item.materialId,
        bomIdSnapshot: bomSnapshot.id,
        bomItemIdSnapshot: item.id,
        bomVersionSnapshot: bomSnapshot.version,
        outputCodeSnapshot: outputCode,
        outputNameSnapshot: outputName,
        rawMaterialCodeSnapshot: item.material.code,
        rawMaterialNameSnapshot: item.material.name,
        rawMaterialSpecSnapshot: item.material.spec,
        pieceLengthMm: item.cutLengthMm,
        requiredQty,
        unit: outputUnit,
        ...effectiveRules,
        tolerancePlusMm: Number(item.cutTolerancePlusMm ?? 0),
        toleranceMinusMm: Number(item.cutToleranceMinusMm ?? 0),
        dueDate: order.dueDate,
        configSnapshot: JSON.stringify({
          configured: nullableRules,
          effective: effectiveRules,
          allowMixedOrders: config.allowMixedOrders,
          minReusableRemnantLengthMm: config.minReusableRemnantLengthMm,
        }),
        ruleWarnings: ruleWarnings.length > 0 ? JSON.stringify(ruleWarnings) : null,
      },
    })
    demands.push(demand)
    createdCount += 1
  }

  if (demands.length === 0) throw new Error('BOM 切割需求数量为 0，请检查产出基准和用量')
  return { demands, createdCount, missingCutLength, ruleWarnings }
}

type DatabaseCuttingPlanInput = {
  demandLines: Array<{ demandId: string; requestedQty: number }>
  sources: Array<{ entityId: string; selectedQty: number }>
  rules?: Partial<CuttingRules>
}

export async function calculateCuttingPlanFromDatabase(
  tx: Prisma.TransactionClient,
  input: DatabaseCuttingPlanInput,
) {
  const demandIds = input.demandLines.map((item) => item.demandId)
  if (new Set(demandIds).size !== demandIds.length) throw new Error('同一切割需求不能重复选择')
  const demands = await tx.cuttingDemand.findMany({
    where: { id: { in: demandIds } },
    include: { productionOrder: { select: { id: true, orderNo: true } } },
  })
  if (demands.length !== demandIds.length) throw new Error('存在无效的切割需求')
  const demandById = new Map(demands.map((item) => [item.id, item]))

  const calculatedDemands = input.demandLines.map((line) => {
    const demand = demandById.get(line.demandId)
    if (!demand) throw new Error('切割需求不存在')
    if (demand.status === 'CANCELLED' || demand.status === 'COMPLETED') {
      throw new Error(`切割需求 ${demand.demandNo} 当前状态不能排样`)
    }
    const remainingQty = demand.requiredQty - demand.plannedQty
    if (remainingQty <= 0) throw new Error(`切割需求 ${demand.demandNo} 已全部排样`)
    if (!Number.isInteger(line.requestedQty) || line.requestedQty <= 0 || line.requestedQty > remainingQty) {
      throw new Error(`切割需求 ${demand.demandNo} 的本次排样数量应为 1-${remainingQty}`)
    }
    return {
      demandId: demand.id,
      mixKey: `${demand.productionOrderId}:${demand.outputMaterialId || demand.outputCodeSnapshot}`,
      rawMaterialId: demand.rawMaterialId,
      pieceLengthMm: demand.pieceLengthMm,
      requestedQty: line.requestedQty,
    }
  })

  const config = await tx.manufacturingConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', allowNegativeStock: false },
    update: {},
  })
  const firstDemand = demands[0]
  const rules: CuttingRules = {
    kerfMm: Number(input.rules?.kerfMm ?? firstDemand.kerfMm),
    headTrimMm: Number(input.rules?.headTrimMm ?? firstDemand.headTrimMm),
    tailTrimMm: Number(input.rules?.tailTrimMm ?? firstDemand.tailTrimMm),
    clampDeadZoneMm: Number(input.rules?.clampDeadZoneMm ?? firstDemand.clampDeadZoneMm),
  }
  if (!input.rules && demands.some((item) => (
    item.kerfMm !== firstDemand.kerfMm
    || item.headTrimMm !== firstDemand.headTrimMm
    || item.tailTrimMm !== firstDemand.tailTrimMm
    || item.clampDeadZoneMm !== firstDemand.clampDeadZoneMm
  ))) {
    throw new Error('混合需求的切割规则不同，请明确输入本次排样规则')
  }

  const sourceIds = input.sources.map((item) => item.entityId)
  const entities = await tx.profileStockEntity.findMany({ where: { id: { in: sourceIds } } })
  if (entities.length !== new Set(sourceIds).size) throw new Error('存在无效的型材实体')
  const entityById = new Map(entities.map((item) => [item.id, item]))
  const calculatedSources = input.sources.map((line) => {
    const entity = entityById.get(line.entityId)
    if (!entity) throw new Error('型材实体不存在')
    if (!['AVAILABLE', 'REMNANT'].includes(entity.status) || !entity.reusable || entity.availableQty <= 0) {
      throw new Error(`实体 ${entity.entityNo} 当前不可用于排样`)
    }
    return {
      entityId: entity.id,
      entityNo: entity.entityNo,
      materialId: entity.materialId,
      sourceLengthMm: entity.actualLengthMm,
      availableQty: entity.availableQty,
      selectedQty: line.selectedQty,
    }
  })

  const calculation = calculateCuttingPlan({
    demands: calculatedDemands,
    sources: calculatedSources,
    rules,
    allowMixedOrders: config.allowMixedOrders === true,
  })
  return { calculation, demands, entities, config }
}

export async function confirmCuttingPlan(
  tx: Prisma.TransactionClient,
  input: DatabaseCuttingPlanInput & { clientRequestId: string },
  actor: { id?: string | null; name?: string | null },
) {
  const existing = await tx.cuttingPlan.findUnique({
    where: { clientRequestId: input.clientRequestId },
    include: {
      demandLines: { include: { demand: true } },
      sources: { include: { entity: true, cuts: { include: { planDemand: true } } } },
    },
  })
  if (existing) return existing

  const { calculation, demands, entities, config } = await calculateCuttingPlanFromDatabase(tx, input)
  if (calculation.totals.plannedQty <= 0) throw new Error('所选实体无法切出任何需求件')

  const now = new Date()
  const dateText = now.toISOString().slice(0, 10).replace(/-/g, '')
  const dailyCount = await tx.cuttingPlan.count({
    where: { createdAt: { gte: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) } },
  })
  const plan = await tx.cuttingPlan.create({
    data: {
      planNo: `CP-${dateText}-${String(dailyCount + 1).padStart(3, '0')}`,
      clientRequestId: input.clientRequestId,
      status: 'CONFIRMED',
      rawMaterialId: demands[0].rawMaterialId,
      allowMixedOrdersSnapshot: config.allowMixedOrders === true,
      ...calculation.rules,
      totalPlannedQty: calculation.totals.plannedQty,
      totalSourceQty: calculation.totals.sourceQty,
      totalSourceLengthMm: calculation.totals.sourceLengthMm,
      totalProductLengthMm: calculation.totals.productLengthMm,
      totalKerfLossMm: calculation.totals.kerfLossMm,
      totalFixedLossMm: calculation.totals.fixedLossMm,
      totalExpectedRemnantMm: calculation.totals.expectedRemnantLengthMm,
      utilizationRate: calculation.totals.utilizationRate,
      calculationSnapshot: JSON.stringify(calculation),
      confirmedAt: now,
      confirmedBy: actor.name || null,
      confirmedById: actor.id || null,
    },
  })
  const stockReservation = await reserveCuttingInventory(tx, {
    planId: plan.id,
    planNo: plan.planNo,
    materialId: demands[0].rawMaterialId,
    stockQty: calculation.totals.sourceQty,
    actor,
  })
  await tx.cuttingPlan.update({
    where: { id: plan.id },
    data: {
      reservedStockQty: stockReservation.stockQty,
      reservedValuationQty: stockReservation.valuationQty,
      reservationStockLogId: stockReservation.movement.id,
    },
  })

  const planDemandByDemandId = new Map<string, { id: string }>()
  for (const result of calculation.demands) {
    const planDemand = await tx.cuttingPlanDemand.create({
      data: {
        planId: plan.id,
        demandId: result.demandId,
        requestedQty: result.requestedQty,
        plannedQty: result.plannedQty,
      },
    })
    planDemandByDemandId.set(result.demandId, planDemand)
  }

  for (const result of calculation.sources) {
    const source = await tx.cuttingPlanSource.create({
      data: {
        planId: plan.id,
        entityId: result.entityId,
        sourceUnitIndex: result.sourceUnitIndex,
        sourceLengthMm: result.sourceLengthMm,
        plannedCutQty: result.plannedCutQty,
        productLengthMm: result.productLengthMm,
        kerfLossMm: result.kerfLossMm,
        fixedLossMm: result.fixedLossMm,
        expectedRemnantLengthMm: result.expectedRemnantLengthMm,
        utilizationRate: result.utilizationRate,
      },
    })
    for (const cut of result.cuts) {
      const planDemand = planDemandByDemandId.get(cut.demandId)
      if (!planDemand) throw new Error('排样需求关联失败')
      await tx.cuttingPlanSourceCut.create({
        data: {
          sourceId: source.id,
          planDemandId: planDemand.id,
          sequence: cut.sequence,
          pieceLengthMm: cut.pieceLengthMm,
          plannedQty: cut.plannedQty,
          productLengthMm: cut.productLengthMm,
          kerfLossMm: cut.kerfLossMm,
        },
      })
    }
  }

  const entityById = new Map(entities.map((item) => [item.id, item]))
  const reservedByEntity = new Map<string, number>()
  for (const source of calculation.sources) {
    reservedByEntity.set(source.entityId, (reservedByEntity.get(source.entityId) || 0) + 1)
  }
  for (const [entityId, quantity] of Array.from(reservedByEntity.entries())) {
    const before = entityById.get(entityId)
    if (!before) throw new Error('型材实体不存在')
    const changed = await tx.profileStockEntity.updateMany({
      where: {
        id: entityId,
        availableQty: { gte: quantity },
        status: { in: ['AVAILABLE', 'REMNANT'] },
        reusable: true,
      },
      data: {
        availableQty: { decrement: quantity },
        reservedQty: { increment: quantity },
      },
    })
    if (changed.count !== 1) throw new Error(`实体 ${before.entityNo} 的可用数量已变化，请重新计算`)
    const afterAvailableQty = before.availableQty - quantity
    const afterStatus = afterAvailableQty === 0 ? 'RESERVED' : before.status
    if (afterStatus !== before.status) {
      await tx.profileStockEntity.update({ where: { id: entityId }, data: { status: afterStatus } })
    }
    await tx.profileStockMovement.create({
      data: {
        entityId,
        movementType: 'RESERVE_FOR_CUTTING',
        quantityDelta: -quantity,
        beforeAvailableQty: before.availableQty,
        afterAvailableQty,
        beforeReservedQty: before.reservedQty,
        afterReservedQty: before.reservedQty + quantity,
        beforeConsumedQty: before.consumedQty,
        afterConsumedQty: before.consumedQty,
        beforeScrappedQty: before.scrappedQty,
        afterScrappedQty: before.scrappedQty,
        beforeStatus: before.status,
        afterStatus,
        lengthBeforeMm: before.actualLengthMm,
        lengthAfterMm: before.actualLengthMm,
        sourceType: 'CUTTING_PLAN',
        sourceId: plan.id,
        idempotencyKey: `CUTTING_PLAN:${plan.id}:${entityId}:RESERVE`,
        operatorId: actor.id || null,
        operatorName: actor.name || null,
        note: `排样方案 ${plan.planNo} 占用 ${quantity} 根`,
      },
    })
  }

  const demandById = new Map(demands.map((item) => [item.id, item]))
  for (const result of calculation.demands) {
    const demand = demandById.get(result.demandId)
    if (!demand || result.plannedQty <= 0) continue
    const nextPlannedQty = demand.plannedQty + result.plannedQty
    await tx.cuttingDemand.update({
      where: { id: demand.id },
      data: {
        plannedQty: nextPlannedQty,
        status: nextPlannedQty >= demand.requiredQty ? 'PLANNED' : 'PARTIALLY_PLANNED',
      },
    })
  }

  return tx.cuttingPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: {
      demandLines: { include: { demand: true } },
      sources: { include: { entity: true, cuts: { include: { planDemand: true } } } },
    },
  })
}

export async function cancelCuttingPlan(
  tx: Prisma.TransactionClient,
  input: {
    planId: string
    reason: string
    actor: { id?: string | null; name?: string | null }
  },
) {
  const plan = await tx.cuttingPlan.findUnique({
    where: { id: input.planId },
    include: {
      demandLines: { include: { demand: true } },
      sources: { include: { entity: true } },
    },
  })
  if (!plan) throw new Error('排样方案不存在')
  if (plan.status === 'CANCELLED') return plan
  if (plan.status !== 'CONFIRMED') throw new Error('只有已确认且未执行的排样方案可以取消')
  const activeTask = await tx.cuttingTask.findFirst({
    where: { cuttingPlanId: plan.id, status: { in: ['READY', 'RUNNING', 'COMPLETED'] } },
    select: { taskNo: true },
  })
  if (activeTask) throw new Error(`排样方案已有锯切任务 ${activeTask.taskNo}，请先冲销或处理任务`)

  let releaseStockLogId: string | null = null
  if (plan.rawMaterialId && Number(plan.reservedStockQty) > 0) {
    const released = await releaseCuttingInventoryReservation(tx, {
      planId: plan.id,
      planNo: plan.planNo,
      materialId: plan.rawMaterialId,
      stockQty: Number(plan.reservedStockQty),
      valuationQty: Number(plan.reservedValuationQty),
      sourceMovementId: plan.reservationStockLogId,
      reason: input.reason,
      actor: input.actor,
    })
    releaseStockLogId = released.movement.id
  }

  const releasedByEntity = new Map<string, { quantity: number; entity: (typeof plan.sources)[number]['entity'] }>()
  for (const source of plan.sources) {
    const current = releasedByEntity.get(source.entityId)
    if (current) current.quantity += 1
    else releasedByEntity.set(source.entityId, { quantity: 1, entity: source.entity })
  }
  for (const [entityId, released] of Array.from(releasedByEntity.entries())) {
    const changed = await tx.profileStockEntity.updateMany({
      where: { id: entityId, reservedQty: { gte: released.quantity } },
      data: {
        availableQty: { increment: released.quantity },
        reservedQty: { decrement: released.quantity },
      },
    })
    if (changed.count !== 1) throw new Error(`实体 ${released.entity.entityNo} 的占用数量异常，不能取消排样`)
    const nextAvailableQty = released.entity.availableQty + released.quantity
    const nextStatus = released.entity.isRemnant ? 'REMNANT' : 'AVAILABLE'
    await tx.profileStockEntity.update({ where: { id: entityId }, data: { status: nextStatus } })
    const reserveMovement = await tx.profileStockMovement.findUnique({
      where: { idempotencyKey: `CUTTING_PLAN:${plan.id}:${entityId}:RESERVE` },
    })
    const releaseMovement = await tx.profileStockMovement.create({
      data: {
        entityId,
        movementType: 'RELEASE_CUTTING_RESERVATION',
        quantityDelta: released.quantity,
        beforeAvailableQty: released.entity.availableQty,
        afterAvailableQty: nextAvailableQty,
        beforeReservedQty: released.entity.reservedQty,
        afterReservedQty: released.entity.reservedQty - released.quantity,
        beforeConsumedQty: released.entity.consumedQty,
        afterConsumedQty: released.entity.consumedQty,
        beforeScrappedQty: released.entity.scrappedQty,
        afterScrappedQty: released.entity.scrappedQty,
        beforeStatus: released.entity.status,
        afterStatus: nextStatus,
        lengthBeforeMm: released.entity.actualLengthMm,
        lengthAfterMm: released.entity.actualLengthMm,
        sourceType: 'CUTTING_PLAN_CANCEL',
        sourceId: plan.id,
        sourceMovementId: reserveMovement?.id,
        idempotencyKey: `CUTTING_PLAN:${plan.id}:${entityId}:RELEASE`,
        operatorId: input.actor.id || null,
        operatorName: input.actor.name || null,
        note: `取消排样方案 ${plan.planNo}: ${input.reason}`,
      },
    })
    if (reserveMovement) {
      await tx.profileStockMovement.update({
        where: { id: reserveMovement.id },
        data: { reversalMovementId: releaseMovement.id },
      })
    }
  }

  for (const line of plan.demandLines) {
    const nextPlannedQty = Math.max(0, line.demand.plannedQty - line.plannedQty)
    await tx.cuttingDemand.update({
      where: { id: line.demandId },
      data: {
        plannedQty: nextPlannedQty,
        status: nextPlannedQty === 0
          ? 'OPEN'
          : nextPlannedQty >= line.demand.requiredQty ? 'PLANNED' : 'PARTIALLY_PLANNED',
      },
    })
  }

  return tx.cuttingPlan.update({
    where: { id: plan.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: input.actor.name || null,
      cancelReason: input.reason,
      releaseStockLogId,
    },
    include: {
      demandLines: { include: { demand: true } },
      sources: { include: { entity: true, cuts: true } },
    },
  })
}
