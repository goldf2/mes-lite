import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { simpleProductSku } from './material-product'

export type DataIntegritySeverity = 'BLOCKING' | 'WARNING' | 'INFO'

export type DataIntegrityActionKey =
  | 'SYNC_BOM_ITEM_UNIT'
  | 'DELETE_BOM_ITEM'
  | 'DELETE_ORPHAN_STOCK'
  | 'SYNC_BOM_OUTPUT_UNIT'
  | 'SYNC_PRODUCT_UNIT'
  | 'CLEAR_STALE_BOM_ITEM_REF'

export type DataIntegrityIssue = {
  id: string
  type: string
  severity: DataIntegritySeverity
  title: string
  detail: string
  entityType: string
  entityId: string
  entityLabel: string
  currentValue?: string | null
  expectedValue?: string | null
  actions: Array<{
    key: DataIntegrityActionKey
    label: string
    destructive: boolean
  }>
}

export type DataIntegrityReport = {
  checkedAt: string
  summary: {
    total: number
    blocking: number
    warning: number
    info: number
    repairable: number
    deletable: number
  }
  issues: DataIntegrityIssue[]
}

type DataIntegrityClient = Prisma.TransactionClient | typeof prisma

const STOCK_BALANCE_TOLERANCE = 0.000001
const stockBalanceFields = [
  'qty',
  'reservedQty',
  'availableQty',
  'valuationQty',
  'reservedValuationQty',
  'availableValuationQty',
  'totalCost',
] as const

function hasStockBalance(stock: Record<(typeof stockBalanceFields)[number], number>) {
  return stockBalanceFields.some((field) => Math.abs(Number(stock[field] || 0)) > STOCK_BALANCE_TOLERANCE)
}

export type AppliedDataIntegrityAction = {
  issue: DataIntegrityIssue
  beforeData: unknown
  afterData: unknown
}

const repairBomUnitAction = {
  key: 'SYNC_BOM_ITEM_UNIT' as const,
  label: '按当前主单位修复',
  destructive: false,
}

const deleteBomItemAction = {
  key: 'DELETE_BOM_ITEM' as const,
  label: '删除错误明细',
  destructive: true,
}

function issueId(type: string, entityId: string) {
  return `${type}:${entityId}`
}

export async function getDataIntegrityReport(
  client: DataIntegrityClient = prisma,
): Promise<DataIntegrityReport> {
  const db = client as typeof prisma
  const [materials, boms, bomItems, consumptionRefs, openCostLayers, invalidRelationStocks] = await Promise.all([
    db.material.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        deletedAt: true,
        stockUnit: true,
        unit: true,
      },
    }),
    db.bOM.findMany({
      include: {
        outputs: { select: { materialId: true } },
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
          },
        },
      },
    }),
    db.bOMItem.findMany({
      where: { itemType: 'MATERIAL' },
      include: {
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            deletedAt: true,
            stockUnit: true,
            unit: true,
          },
        },
        bom: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
    db.dailyProductionConsumption.findMany({
      where: { bomItemId: { not: null } },
      select: {
        id: true,
        bomItemId: true,
        materialCode: true,
        materialName: true,
        report: {
          select: {
            reportNo: true,
            status: true,
          },
        },
      },
    }),
    db.inventoryCostLayer.findMany({
      where: {
        status: 'OPEN',
        remainingStockQty: { gt: 0.000001 },
      },
      select: {
        id: true,
        remainingStockQty: true,
        stockUnit: true,
        material: {
          select: {
            id: true,
            code: true,
            name: true,
            stockUnit: true,
            unit: true,
          },
        },
      },
    }),
    db.stock.findMany({
      where: {
        OR: [
          { materialId: null, productId: null },
          { materialId: { not: null }, productId: { not: null } },
        ],
      },
      select: {
        id: true,
        materialId: true,
        productId: true,
        qty: true,
        reservedQty: true,
        availableQty: true,
        valuationQty: true,
        reservedValuationQty: true,
        availableValuationQty: true,
        totalCost: true,
        _count: {
          select: {
            logs: true,
            locationBalances: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
  ])

  const issues: DataIntegrityIssue[] = []
  const materialByCode = new Map(materials.map((material) => [material.code, material]))
  const bomItemIdSet = new Set(bomItems.map((item) => item.id))
  const outputMaterialIdsByBomId = new Map(boms.map((bom) => [bom.id, new Set(bom.outputs.map((output) => output.materialId))]))

  for (const bom of boms) {
    const exact = materialByCode.get(bom.product.sku)
    const prefixed = bom.product.sku.startsWith('MAT-')
      ? materialByCode.get(bom.product.sku.slice(4))
      : undefined
    const candidates = Array.from(new Map(
      [exact, prefixed].filter(Boolean).map((material) => [material!.id, material!]),
    ).values())

    if (candidates.length !== 1) {
      issues.push({
        id: issueId('BOM_OUTPUT_MATERIAL_UNRESOLVED', bom.id),
        type: 'BOM_OUTPUT_MATERIAL_UNRESOLVED',
        severity: 'WARNING',
        title: 'BOM 无法唯一关联产出物料',
        detail: candidates.length === 0
          ? `兼容产品 ${bom.product.sku} 没有对应的物料编码；可能是旧产品或物料改码后未同步。`
          : `兼容产品 ${bom.product.sku} 同时匹配多个物料，无法确定产出物料。`,
        entityType: 'BOM',
        entityId: bom.id,
        entityLabel: `${bom.product.sku} · ${bom.product.name}`,
        actions: [],
      })
      continue
    }

    const outputMaterial = candidates[0]
    const outputMaterialIds = outputMaterialIdsByBomId.get(bom.id)
    if (outputMaterialIds && outputMaterialIds.size === 0) outputMaterialIds.add(outputMaterial.id)
    const expectedUnit = outputMaterial.stockUnit || outputMaterial.unit
    if (bom.outputUnit !== expectedUnit) {
      issues.push({
        id: issueId('BOM_OUTPUT_UNIT_MISMATCH', bom.id),
        type: 'BOM_OUTPUT_UNIT_MISMATCH',
        severity: 'BLOCKING',
        title: 'BOM 产出单位与物料主单位不一致',
        detail: `BOM 保存的是 ${bom.outputUnit || '空'}，产出物料当前主库存单位是 ${expectedUnit}。`,
        entityType: 'BOM',
        entityId: bom.id,
        entityLabel: `${outputMaterial.code} · ${outputMaterial.name}`,
        currentValue: bom.outputUnit,
        expectedValue: expectedUnit,
        actions: [{
          key: 'SYNC_BOM_OUTPUT_UNIT',
          label: '同步产出单位',
          destructive: false,
        }],
      })
    }

    if (bom.product.unit !== expectedUnit) {
      issues.push({
        id: issueId('PRODUCT_UNIT_MISMATCH', bom.product.id),
        type: 'PRODUCT_UNIT_MISMATCH',
        severity: 'WARNING',
        title: '兼容产品单位与物料主单位不一致',
        detail: `兼容产品保存的是 ${bom.product.unit || '空'}，物料当前主库存单位是 ${expectedUnit}。`,
        entityType: 'PRODUCT',
        entityId: bom.product.id,
        entityLabel: `${outputMaterial.code} · ${outputMaterial.name}`,
        currentValue: bom.product.unit,
        expectedValue: expectedUnit,
        actions: [{
          key: 'SYNC_PRODUCT_UNIT',
          label: '同步兼容产品单位',
          destructive: false,
        }],
      })
    }
  }

  const duplicateGroups = new Map<string, typeof bomItems>()
  for (const item of bomItems) {
    if (!item.materialId) continue
    const key = `${item.bomId}:${item.materialId}`
    const group = duplicateGroups.get(key) || []
    group.push(item)
    duplicateGroups.set(key, group)
  }
  const duplicateItemIds = new Set<string>()
  for (const group of Array.from(duplicateGroups.values())) {
    group.slice(1).forEach((item) => duplicateItemIds.add(item.id))
  }

  for (const item of bomItems) {
    const productLabel = `${item.bom.product.sku} · ${item.bom.product.name}`
    if (!item.materialId || !item.material) {
      issues.push({
        id: issueId('BOM_MATERIAL_MISSING', item.id),
        type: 'BOM_MATERIAL_MISSING',
        severity: 'BLOCKING',
        title: 'BOM 明细缺少原料',
        detail: `${productLabel} 中存在没有有效原料引用的明细。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: productLabel,
        actions: [deleteBomItemAction],
      })
      continue
    }

    const materialLabel = `${item.material.code} · ${item.material.name}`
    if (item.outputMaterialId && !outputMaterialIdsByBomId.get(item.bomId)?.has(item.outputMaterialId)) {
      issues.push({
        id: issueId('BOM_OUTPUT_RELATION_MISSING', item.id),
        type: 'BOM_OUTPUT_RELATION_MISSING',
        severity: 'BLOCKING',
        title: 'BOM 历史投入绑定了无效产出',
        detail: `${productLabel} 中原料 ${materialLabel} 的历史产出引用不属于本方案；新整批投入应不绑定具体产出。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: `${productLabel} → ${materialLabel}`,
        actions: [deleteBomItemAction],
      })
    }
    if (item.material.deletedAt) {
      issues.push({
        id: issueId('BOM_MATERIAL_ARCHIVED', item.id),
        type: 'BOM_MATERIAL_ARCHIVED',
        severity: 'BLOCKING',
        title: 'BOM 引用了已归档原料',
        detail: `${productLabel} 仍引用已归档原料 ${materialLabel}。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: `${productLabel} → ${materialLabel}`,
        actions: [deleteBomItemAction],
      })
    }

    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      issues.push({
        id: issueId('BOM_INVALID_QUANTITY', item.id),
        type: 'BOM_INVALID_QUANTITY',
        severity: 'BLOCKING',
        title: 'BOM 每批投入数量无效',
        detail: `${productLabel} 使用 ${materialLabel} 的每批投入数量为 ${item.quantity}。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: `${productLabel} → ${materialLabel}`,
        currentValue: String(item.quantity),
        expectedValue: '大于 0',
        actions: [deleteBomItemAction],
      })
    }

    if (duplicateItemIds.has(item.id)) {
      issues.push({
        id: issueId('BOM_DUPLICATE_MATERIAL', item.id),
        type: 'BOM_DUPLICATE_MATERIAL',
        severity: 'BLOCKING',
        title: 'BOM 重复添加同一投入',
        detail: `${productLabel} 中原料 ${materialLabel} 出现多次；整批投入中每种物料只能出现一次。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: `${productLabel} → ${materialLabel}`,
        actions: [deleteBomItemAction],
      })
    }

    if (outputMaterialIdsByBomId.get(item.bomId)?.has(item.material.id)) {
      issues.push({
        id: issueId('BOM_SELF_REFERENCE', item.id),
        type: 'BOM_SELF_REFERENCE',
        severity: 'BLOCKING',
        title: 'BOM 消耗产出物料自身',
        detail: `${productLabel} 的原料明细引用了自身。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: `${productLabel} → ${materialLabel}`,
        actions: [deleteBomItemAction],
      })
    }

    const expectedUnit = item.material.stockUnit || item.material.unit
    if (item.unit !== expectedUnit) {
      issues.push({
        id: issueId('BOM_UNIT_MISMATCH', item.id),
        type: 'BOM_UNIT_MISMATCH',
        severity: 'BLOCKING',
        title: 'BOM 原料单位与当前主单位不一致',
        detail: `${productLabel} 使用 ${materialLabel}：BOM 保存单位为 ${item.unit || '空'}，物料当前主库存单位为 ${expectedUnit}。修复只更新单位标签，不换算每批数量。`,
        entityType: 'BOM_ITEM',
        entityId: item.id,
        entityLabel: `${productLabel} → ${materialLabel}`,
        currentValue: item.unit,
        expectedValue: expectedUnit,
        actions: [repairBomUnitAction, deleteBomItemAction],
      })
    }
  }

  for (const consumption of consumptionRefs) {
    if (!consumption.bomItemId || bomItemIdSet.has(consumption.bomItemId)) continue
    issues.push({
      id: issueId('DAILY_BOM_ITEM_REFERENCE_STALE', consumption.id),
      type: 'DAILY_BOM_ITEM_REFERENCE_STALE',
      severity: 'INFO',
      title: '生产日报保存了已失效的 BOM 明细指针',
      detail: `日报 ${consumption.report.reportNo} 已保存完整耗用快照，原 BOM 明细重建后指针失效；可清空该指针，日报数值不会删除。`,
      entityType: 'DAILY_PRODUCTION_CONSUMPTION',
      entityId: consumption.id,
      entityLabel: `${consumption.report.reportNo} → ${consumption.materialCode} · ${consumption.materialName}`,
      currentValue: consumption.bomItemId,
      expectedValue: null,
      actions: [{
        key: 'CLEAR_STALE_BOM_ITEM_REF',
        label: '清理失效指针',
        destructive: false,
      }],
    })
  }

  for (const layer of openCostLayers) {
    const expectedUnit = layer.material.stockUnit || layer.material.unit
    if (layer.stockUnit === expectedUnit) continue
    issues.push({
      id: issueId('OPEN_COST_LAYER_UNIT_MISMATCH', layer.id),
      type: 'OPEN_COST_LAYER_UNIT_MISMATCH',
      severity: 'BLOCKING',
      title: '未耗尽成本层使用旧库存单位',
      detail: `${layer.material.code} · ${layer.material.name} 尚有 ${layer.remainingStockQty} ${layer.stockUnit} 成本层余额，当前主库存单位为 ${expectedUnit}。该记录参与 FIFO/成本计算，必须人工核对库存调整，工具不会直接删除。`,
      entityType: 'INVENTORY_COST_LAYER',
      entityId: layer.id,
      entityLabel: `${layer.material.code} · ${layer.material.name}`,
      currentValue: layer.stockUnit,
      expectedValue: expectedUnit,
      actions: [],
    })
  }

  for (const stock of invalidRelationStocks) {
    const hasNeitherOwner = !stock.materialId && !stock.productId
    const hasBusinessBalance = hasStockBalance(stock)
    const hasReferences = stock._count.logs > 0 || stock._count.locationBalances > 0
    const safeToDelete = hasNeitherOwner && !hasBusinessBalance && !hasReferences
    const relationSummary = hasNeitherOwner
      ? '没有关联物料或内部兼容物料'
      : '同时关联了物料和内部兼容物料'
    const riskSummary = [
      hasBusinessBalance ? '仍包含库存数量或金额' : '',
      stock._count.locationBalances > 0 ? `包含 ${stock._count.locationBalances} 条库位余额` : '',
      stock._count.logs > 0 ? `包含 ${stock._count.logs} 条库存流水` : '',
    ].filter(Boolean).join('，')

    issues.push({
      id: issueId('STOCK_OWNER_INVALID', stock.id),
      type: 'STOCK_OWNER_INVALID',
      severity: 'BLOCKING',
      title: safeToDelete ? '孤立的零余额库存记录' : '库存记录归属关系异常',
      detail: safeToDelete
        ? `该库存记录${relationSummary}，全部余额为零且没有库位或流水引用，可由维护工具安全清理。`
        : `该库存记录${relationSummary}${riskSummary ? `，${riskSummary}` : ''}。工具不会自动删除，请先核对业务数据。`,
      entityType: 'STOCK',
      entityId: stock.id,
      entityLabel: `库存记录 ${stock.id}`,
      currentValue: `${stock.materialId || '无物料'} / ${stock.productId || '无兼容物料'}`,
      expectedValue: '必须且只能关联一个库存对象',
      actions: safeToDelete ? [{
        key: 'DELETE_ORPHAN_STOCK',
        label: '清理孤立空库存',
        destructive: true,
      }] : [],
    })
  }

  const severityOrder: Record<DataIntegritySeverity, number> = {
    BLOCKING: 0,
    WARNING: 1,
    INFO: 2,
  }
  issues.sort((left, right) => (
    severityOrder[left.severity] - severityOrder[right.severity]
    || left.title.localeCompare(right.title, 'zh-CN')
    || left.entityLabel.localeCompare(right.entityLabel, 'zh-CN')
  ))

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      total: issues.length,
      blocking: issues.filter((issue) => issue.severity === 'BLOCKING').length,
      warning: issues.filter((issue) => issue.severity === 'WARNING').length,
      info: issues.filter((issue) => issue.severity === 'INFO').length,
      repairable: issues.filter((issue) => issue.actions.some((action) => !action.destructive)).length,
      deletable: issues.filter((issue) => issue.actions.some((action) => action.destructive)).length,
    },
    issues,
  }
}

export async function applyDataIntegrityAction(
  client: DataIntegrityClient,
  issueId: string,
  action: DataIntegrityActionKey,
): Promise<AppliedDataIntegrityAction> {
  const db = client as typeof prisma
  const report = await getDataIntegrityReport(client)
  const issue = report.issues.find((item) => item.id === issueId)
  const allowedAction = issue?.actions.find((item) => item.key === action)
  if (!issue || !allowedAction) {
    throw new Error('该问题已不存在或当前操作不再适用，请重新检查')
  }

  let beforeData: unknown
  let afterData: unknown = null

  if (action === 'SYNC_BOM_ITEM_UNIT') {
    const item = await db.bOMItem.findUniqueOrThrow({
      where: { id: issue.entityId },
      include: { material: true },
    })
    if (!item.material) throw new Error('BOM 原料不存在，不能同步单位')
    beforeData = item
    afterData = await db.bOMItem.update({
      where: { id: item.id },
      data: { unit: item.material.stockUnit || item.material.unit },
    })
  } else if (action === 'DELETE_BOM_ITEM') {
    const item = await db.bOMItem.findUniqueOrThrow({ where: { id: issue.entityId } })
    const detachedSnapshots = await db.dailyProductionConsumption.count({
      where: { bomItemId: item.id },
    })
    beforeData = { ...item, detachedDailyProductionSnapshots: detachedSnapshots }
    if (detachedSnapshots > 0) {
      await db.dailyProductionConsumption.updateMany({
        where: { bomItemId: item.id },
        data: { bomItemId: null },
      })
    }
    await db.bOMItem.delete({ where: { id: issue.entityId } })
  } else if (action === 'DELETE_ORPHAN_STOCK') {
    const stock = await db.stock.findUniqueOrThrow({
      where: { id: issue.entityId },
      include: {
        _count: {
          select: {
            logs: true,
            locationBalances: true,
          },
        },
      },
    })
    if (stock.materialId || stock.productId || hasStockBalance(stock) || stock._count.logs > 0 || stock._count.locationBalances > 0) {
      throw new Error('该库存记录已经变化或仍有业务数据，不能自动清理')
    }
    beforeData = stock
    await db.stock.delete({ where: { id: stock.id } })
  } else if (action === 'SYNC_BOM_OUTPUT_UNIT') {
    const bom = await db.bOM.findUniqueOrThrow({
      where: { id: issue.entityId },
      include: { product: true },
    })
    beforeData = bom
    afterData = await db.bOM.update({
      where: { id: bom.id },
      data: { outputUnit: issue.expectedValue || bom.outputUnit },
    })
  } else if (action === 'SYNC_PRODUCT_UNIT') {
    const product = await db.product.findUniqueOrThrow({ where: { id: issue.entityId } })
    beforeData = product
    afterData = await db.product.update({
      where: { id: product.id },
      data: { unit: issue.expectedValue || product.unit },
    })
  } else {
    const consumption = await db.dailyProductionConsumption.findUniqueOrThrow({
      where: { id: issue.entityId },
    })
    beforeData = consumption
    afterData = await db.dailyProductionConsumption.update({
      where: { id: consumption.id },
      data: { bomItemId: null },
    })
  }

  return { issue, beforeData, afterData }
}
