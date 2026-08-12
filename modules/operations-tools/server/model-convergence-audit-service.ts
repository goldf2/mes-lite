import type { PrismaClient } from '@prisma/client'
import {
  normalizeProductionOrderStatus,
  normalizeProductionOrderStatusDistribution,
} from '../../production/domain/production-order-status'

type ModelConvergenceDatabase = Pick<
  PrismaClient,
  | '$queryRawUnsafe'
  | 'material'
  | 'product'
  | 'bOM'
  | 'bomCostRun'
  | 'processRoute'
  | 'sawingCostScenario'
  | 'productionOrder'
  | 'stock'
  | 'stockIn'
  | 'shipment'
  | 'returnOrder'
  | 'dailyProductionReport'
  | 'pickItem'
  | 'workReport'
>

const nonZero = (value: unknown) => Math.abs(Number(value || 0)) > 0.000001

function matchingMaterialCodes(sku: string, materialCodes: Set<string>) {
  const candidates = sku.startsWith('MAT-') ? [sku, sku.slice(4)] : [sku]
  return candidates.filter((code) => materialCodes.has(code))
}

async function projectionIntegrity(
  db: Pick<PrismaClient, '$queryRawUnsafe'>,
  table: 'BOM' | 'BomCostRun' | 'ProcessRoute' | 'SawingCostScenario' | 'ProductionOrder' | 'StockIn' | 'Shipment' | 'ReturnOrder',
) {
  const rows = await db.$queryRawUnsafe<Array<{
    invalidMaterialRows: bigint | number
    mismatchedProductRows: bigint | number
  }>>(`
    SELECT
      SUM(CASE WHEN source.materialId IS NOT NULL AND material.id IS NULL THEN 1 ELSE 0 END) AS invalidMaterialRows,
      SUM(CASE WHEN source.materialId IS NOT NULL AND (product.materialId IS NULL OR source.materialId <> product.materialId) THEN 1 ELSE 0 END) AS mismatchedProductRows
    FROM "${table}" AS source
    LEFT JOIN "Material" AS material ON material.id = source.materialId AND material.deletedAt IS NULL
    LEFT JOIN "Product" AS product ON product.id = source.productId
    ${table === 'SawingCostScenario' ? 'WHERE source.productId IS NOT NULL' : ''}
  `)
  return {
    invalidMaterialRows: Number(rows[0]?.invalidMaterialRows || 0),
    mismatchedProductRows: Number(rows[0]?.mismatchedProductRows || 0),
  }
}

export async function getModelConvergenceAudit(database?: ModelConvergenceDatabase) {
  const db = database || (await import('../../../lib/prisma')).prisma
  const requiredProjectionColumns: Array<[string, string]> = [
    ['Product', 'materialId'], ['BOM', 'materialId'], ['BomCostRun', 'materialId'],
    ['ProcessRoute', 'materialId'], ['SawingCostScenario', 'materialId'], ['StockIn', 'materialId'],
  ]
  const migrationApplied = (await Promise.all(requiredProjectionColumns.map(([table, column]) => (
    db.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM pragma_table_info('${table}') WHERE name = '${column}'`,
    ).then((rows) => Number(rows[0]?.count || 0) === 1)
  )))).every(Boolean)
  if (!migrationApplied) {
    const products = await db.product.findMany({ select: { sku: true } })
    const materials = await db.material.findMany({ where: { deletedAt: null }, select: { code: true } })
    const materialCodes = new Set(materials.map((material) => material.code))
    const candidateCounts = products.map((product) => matchingMaterialCodes(product.sku, materialCodes).length)
    const mappedByCodeFallback = candidateCounts.filter((count) => count === 1).length
    const ambiguousCodeMappings = candidateCounts.filter((count) => count > 1).length
    return {
      schema: { materialProjectionMigrationApplied: false },
      products: {
        total: products.length, mappedExplicitly: 0, mappedByCodeFallback, ambiguousCodeMappings,
        invalidExplicitMappings: 0, unmapped: candidateCounts.filter((count) => count === 0).length,
      },
      productDependencies: null,
      materialProjections: null,
      productionOrderStatuses: null,
      inventory: null,
      legacyProduction: null,
      blockers: ['数据库尚未应用 Material 投影扩展迁移'],
      readyForProductForeignKeyMigration: false,
    }
  }
  const [
    materials,
    products,
    productOnlyStocks,
    materialMissingStock,
    boms,
    bomCostRuns,
    processRoutes,
    sawingScenarios,
    productionOrders,
    ordersMissingMaterial,
    productionOrderStatusRows,
    stockIns,
    shipments,
    shipmentsMissingMaterial,
    returns,
    returnsMissingMaterial,
    dailyReports,
    pickItems,
    workReports,
  ] = await Promise.all([
    db.material.findMany({ where: { deletedAt: null }, select: { code: true } }),
    db.product.findMany({ select: { sku: true, materialId: true } }),
    db.stock.findMany({
      where: { productId: { not: null }, materialId: null },
      select: {
        qty: true,
        reservedQty: true,
        availableQty: true,
        quarantineQty: true,
        holdQty: true,
        valuationQty: true,
        reservedValuationQty: true,
        availableValuationQty: true,
        quarantineValuationQty: true,
        holdValuationQty: true,
        totalCost: true,
        quarantineCost: true,
        holdCost: true,
        valuationUnitCost: true,
        stockUnitCost: true,
        logs: { select: { id: true }, take: 1 },
        locationBalances: { select: {
          qty: true, reservedQty: true, availableQty: true, quarantineQty: true, holdQty: true,
        } },
      },
    }),
    db.material.count({ where: { deletedAt: null, stock: null } }),
    db.bOM.count(),
    db.bomCostRun.count(),
    db.processRoute.count(),
    db.sawingCostScenario.count({ where: { productId: { not: null } } }),
    db.productionOrder.count(),
    db.productionOrder.count({ where: { materialId: null } }),
    db.productionOrder.groupBy({ by: ['status'], _count: true }),
    db.stockIn.count(),
    db.shipment.count(),
    db.shipment.count({ where: { materialId: null } }),
    db.returnOrder.count(),
    db.returnOrder.count({ where: { materialId: null } }),
    db.dailyProductionReport.count(),
    db.pickItem.count(),
    db.workReport.count(),
  ])

  const activeMaterialIds = new Set((await db.material.findMany({
    where: { deletedAt: null },
    select: { id: true },
  })).map((material) => material.id))
  const materialCodes = new Set(materials.map((material) => material.code))
  const explicitlyMappedProducts = products.filter((product) => product.materialId && activeMaterialIds.has(product.materialId))
  const fallbackMappedProducts = products.filter((product) => (
    !product.materialId && matchingMaterialCodes(product.sku, materialCodes).length === 1
  ))
  const ambiguousCodeMappings = products.filter((product) => (
    !product.materialId && matchingMaterialCodes(product.sku, materialCodes).length > 1
  )).length
  const invalidExplicitMappings = products.filter((product) => product.materialId && !activeMaterialIds.has(product.materialId)).length
  const [
    bomsMissingMaterial,
    bomsWithoutSinglePrimaryOutput,
    bomPrimaryOutputMismatches,
    bomCostRunsMissingMaterial,
    processRoutesMissingMaterial,
    sawingScenariosMissingMaterial,
    stockInsMissingMaterial,
    bomProjectionIntegrity,
    bomCostProjectionIntegrity,
    routeProjectionIntegrity,
    sawingProjectionIntegrity,
    orderProjectionIntegrity,
    stockInProjectionIntegrity,
    shipmentProjectionIntegrity,
    returnProjectionIntegrity,
  ] = await Promise.all([
    db.bOM.count({ where: { materialId: null } }),
    db.$queryRawUnsafe<Array<{ count: bigint | number }>>(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT bom.id
        FROM "BOM" AS bom
        LEFT JOIN "BOMOutput" AS output ON output.bomId = bom.id AND output.isPrimary = 1
        GROUP BY bom.id
        HAVING COUNT(output.id) <> 1
      )
    `).then((rows) => Number(rows[0]?.count || 0)),
    db.$queryRawUnsafe<Array<{ count: bigint | number }>>(`
      SELECT COUNT(*) AS count
      FROM "BOM" AS bom
      INNER JOIN "BOMOutput" AS output ON output.bomId = bom.id AND output.isPrimary = 1
      WHERE bom.materialId IS NOT NULL AND bom.materialId <> output.materialId
    `).then((rows) => Number(rows[0]?.count || 0)),
    db.bomCostRun.count({ where: { materialId: null } }),
    db.processRoute.count({ where: { materialId: null } }),
    db.sawingCostScenario.count({ where: { productId: { not: null }, materialId: null } }),
    db.stockIn.count({ where: { materialId: null } }),
    projectionIntegrity(db, 'BOM'),
    projectionIntegrity(db, 'BomCostRun'),
    projectionIntegrity(db, 'ProcessRoute'),
    projectionIntegrity(db, 'SawingCostScenario'),
    projectionIntegrity(db, 'ProductionOrder'),
    projectionIntegrity(db, 'StockIn'),
    projectionIntegrity(db, 'Shipment'),
    projectionIntegrity(db, 'ReturnOrder'),
  ])
  const projectionIntegrityTotals = [
    bomProjectionIntegrity, bomCostProjectionIntegrity, routeProjectionIntegrity,
    sawingProjectionIntegrity, orderProjectionIntegrity, stockInProjectionIntegrity,
    shipmentProjectionIntegrity, returnProjectionIntegrity,
  ].reduce((total, item) => ({
    invalidMaterialRows: total.invalidMaterialRows + item.invalidMaterialRows,
    mismatchedProductRows: total.mismatchedProductRows + item.mismatchedProductRows,
  }), { invalidMaterialRows: 0, mismatchedProductRows: 0 })
  const riskyProductOnlyStocks = productOnlyStocks.filter((stock) => (
    [
      stock.qty,
      stock.reservedQty,
      stock.availableQty,
      stock.quarantineQty,
      stock.holdQty,
      stock.valuationQty,
      stock.reservedValuationQty,
      stock.availableValuationQty,
      stock.quarantineValuationQty,
      stock.holdValuationQty,
      stock.totalCost,
      stock.quarantineCost,
      stock.holdCost,
      stock.valuationUnitCost,
      stock.stockUnitCost,
    ].some(nonZero)
    || stock.logs.length > 0
    || stock.locationBalances.some((balance) => (
      nonZero(balance.qty) || nonZero(balance.reservedQty) || nonZero(balance.availableQty)
      || nonZero(balance.quarantineQty) || nonZero(balance.holdQty)
    ))
  )).length

  const blockers: string[] = []
  const unmappedProducts = products.filter((product) => (
    !product.materialId && matchingMaterialCodes(product.sku, materialCodes).length === 0
  )).length
  if (invalidExplicitMappings > 0) blockers.push('存在指向无效或已归档 Material 的 Product 显式映射')
  if (ambiguousCodeMappings > 0) blockers.push('存在对应多个 Material 候选的 Product')
  if (fallbackMappedProducts.length > 0) blockers.push('存在仅按编码推断、尚未人工确认的 Product 映射')
  if (unmappedProducts > 0) blockers.push('存在无法按编码唯一映射到 Material 的 Product')
  if (productOnlyStocks.length > 0) blockers.push('存在仍以 Product 为所有者的库存余额行')
  if (bomsMissingMaterial > 0) blockers.push('存在 materialId 为空的 BOM')
  if (bomsWithoutSinglePrimaryOutput > 0) blockers.push('存在缺少唯一主产出的 BOM')
  if (bomPrimaryOutputMismatches > 0) blockers.push('存在 materialId 与主产出不一致的 BOM')
  if (bomCostRunsMissingMaterial > 0) blockers.push('存在 materialId 为空的 BOM 成本运行')
  if (processRoutesMissingMaterial > 0) blockers.push('存在 materialId 为空的工艺路线')
  if (sawingScenariosMissingMaterial > 0) blockers.push('存在 materialId 为空的已绑定锯切方案')
  if (stockInsMissingMaterial > 0) blockers.push('存在 materialId 为空的历史生产入库')
  if (projectionIntegrityTotals.invalidMaterialRows > 0) blockers.push('存在指向无效或已归档 Material 的投影记录')
  if (projectionIntegrityTotals.mismatchedProductRows > 0) blockers.push('存在与 Product 显式映射不一致的 Material 投影记录')
  if (ordersMissingMaterial > 0) blockers.push('存在 materialId 为空的生产订单')
  if (shipmentsMissingMaterial > 0) blockers.push('存在 materialId 为空的发货单')
  if (returnsMissingMaterial > 0) blockers.push('存在 materialId 为空的退货单')
  const rawProductionOrderStatuses = productionOrderStatusRows.map((item) => ({
    status: item.status,
    count: item._count,
  }))

  return {
    schema: { materialProjectionMigrationApplied: true },
    products: {
      total: products.length,
      mappedExplicitly: explicitlyMappedProducts.length,
      mappedByCodeFallback: fallbackMappedProducts.length,
      ambiguousCodeMappings,
      invalidExplicitMappings,
      unmapped: unmappedProducts,
    },
    productDependencies: {
      boms,
      bomCostRuns,
      processRoutes,
      sawingScenarios,
      productionOrders,
      stockIns,
      shipments,
      returns,
    },
    materialProjections: {
      bomsMissingMaterial,
      bomsWithoutSinglePrimaryOutput,
      bomPrimaryOutputMismatches,
      bomCostRunsMissingMaterial,
      processRoutesMissingMaterial,
      sawingScenariosMissingMaterial,
      stockInsMissingMaterial,
      integrity: {
        boms: bomProjectionIntegrity,
        bomCostRuns: bomCostProjectionIntegrity,
        processRoutes: routeProjectionIntegrity,
        sawingScenarios: sawingProjectionIntegrity,
        productionOrders: orderProjectionIntegrity,
        stockIns: stockInProjectionIntegrity,
        shipments: shipmentProjectionIntegrity,
        returns: returnProjectionIntegrity,
        total: projectionIntegrityTotals,
      },
      ordersMissingMaterial,
      shipmentsMissingMaterial,
      returnsMissingMaterial,
    },
    productionOrderStatuses: {
      raw: rawProductionOrderStatuses,
      normalized: normalizeProductionOrderStatusDistribution(rawProductionOrderStatuses),
      legacyAliasRows: rawProductionOrderStatuses.reduce((count, item) => (
        count + (normalizeProductionOrderStatus(item.status) === item.status ? 0 : item.count)
      ), 0),
    },
    inventory: {
      materialMissingStock,
      productOnlyStocks: productOnlyStocks.length,
      riskyProductOnlyStocks,
    },
    legacyProduction: {
      dailyReports,
      pickItems,
      workReports,
      stockIns,
    },
    blockers,
    readyForProductForeignKeyMigration: blockers.length === 0,
  }
}
